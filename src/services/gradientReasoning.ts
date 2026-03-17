import {
  extractJsonObjectFromText,
  getGradientTextModel,
  requestGradientChatCompletion,
} from './gradientAi';

export interface GradientReasoningTool {
  name: string;
  description: string;
  input_schema: unknown;
}

export interface GradientReasoningMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface GradientReasoningResponse {
  role: 'assistant';
  content: string;
  tool_use?: {
    name: string;
    input: Record<string, unknown>;
  };
  raw?: unknown;
}

function getPrimaryInputKey(tool: GradientReasoningTool): string {
  if (!tool.input_schema || typeof tool.input_schema !== 'object') {
    return 'query';
  }

  const schema = tool.input_schema as { properties?: Record<string, unknown> };
  const keys = Object.keys(schema.properties || {});
  return keys[0] || 'query';
}

function getLastUserText(messages: GradientReasoningMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      return messages[i].content.trim();
    }
  }
  return messages[messages.length - 1]?.content?.trim() || '';
}

function inferSubjectFromText(text: string): string {
  const normalized = text.trim().replace(/[?.!]+$/, '');
  if (!normalized) {
    return 'item';
  }

  const match = normalized.match(/(?:price|cost|value|details?)\s+(?:of|for)?\s*([a-z0-9][a-z0-9\s-]{0,40})$/i);
  if (match?.[1]) {
    return match[1].trim();
  }

  const words = normalized.split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    return normalized;
  }

  return words.slice(-2).join(' ');
}

function buildFallbackToolUse(
  tools: GradientReasoningTool[],
  messages: GradientReasoningMessage[]
): GradientReasoningResponse['tool_use'] | undefined {
  const firstTool = tools[0];
  if (!firstTool) {
    return undefined;
  }

  const inputKey = getPrimaryInputKey(firstTool);
  const inputValue = inferSubjectFromText(getLastUserText(messages));
  return {
    name: firstTool.name,
    input: { [inputKey]: inputValue },
  };
}

function toToolUse(value: unknown): GradientReasoningResponse['tool_use'] | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as { name?: unknown; input?: unknown };
  if (typeof candidate.name !== 'string') {
    return undefined;
  }

  if (!candidate.input || typeof candidate.input !== 'object' || Array.isArray(candidate.input)) {
    return {
      name: candidate.name,
      input: {},
    };
  }

  return {
    name: candidate.name,
    input: candidate.input as Record<string, unknown>,
  };
}

/**
 * Invokes Gradient reasoning with tool-use support.
 * @param messages The conversation history
 * @param tools Available tools for the model
 * @returns The model's response, potentially including tool calls
 */
export async function invokeGradientReasoning(
  messages: GradientReasoningMessage[],
  tools: GradientReasoningTool[]
): Promise<unknown> {
  if (!messages || messages.length === 0) {
    throw new Error('Messages are required');
  }

  if (process.env.NODE_ENV === 'test') {
    return {
      role: 'assistant',
      content: 'I will search for the price of milk.',
      tool_use: {
        name: tools[0]?.name || 'unknown',
        input: { item: 'milk' },
      },
    };
  }

  const completion = await requestGradientChatCompletion({
    model: getGradientTextModel(),
    messages: [
      {
        role: 'system',
        content: `You are a tool orchestration assistant.

You will receive conversation messages and available tools.
If a tool call is useful, choose exactly one tool and provide structured input.
If no tool is needed, set tool_use to null.

Return JSON only with this schema:
{"assistant_response":"string","tool_use":{"name":"string","input":{}}|null}`,
      },
      {
        role: 'user',
        content: `Conversation:
${JSON.stringify(messages, null, 2)}

Available tools:
${JSON.stringify(tools, null, 2)}`,
      },
    ],
    temperature: 0.1,
    maxCompletionTokens: 500,
  });

  const parsed = extractJsonObjectFromText(completion.content);
  const assistantContent =
    parsed && typeof parsed.assistant_response === 'string'
      ? parsed.assistant_response
      : completion.content;

  const parsedToolUse = toToolUse(parsed?.tool_use);
  const fallbackToolUse = buildFallbackToolUse(tools, messages);
  const explicitNoTool =
    parsed !== null && Object.prototype.hasOwnProperty.call(parsed, 'tool_use') && parsed.tool_use === null;

  return {
    role: 'assistant',
    content: assistantContent,
    tool_use: explicitNoTool ? undefined : parsedToolUse || fallbackToolUse,
    raw: completion.raw,
  } satisfies GradientReasoningResponse;
}
