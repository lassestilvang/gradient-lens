export const DEFAULT_BASE_URL = 'https://inference.do-ai.run';
const DEFAULT_TEXT_MODEL = 'llama3.3-70b-instruct';
const DEFAULT_VISION_MODEL = 'openai-gpt-4o-mini';

type GradientRole = 'system' | 'user' | 'assistant';

type GradientContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface GradientMessage {
  role: GradientRole;
  content: string | GradientContentPart[];
}

export interface GradientCompletionRequest {
  model?: string;
  messages: GradientMessage[];
  temperature?: number;
  maxCompletionTokens?: number;
}

export interface GradientCompletionResponse {
  content: string;
  raw: unknown;
}

export function getModelAccessKey(): string {
  const key = process.env.DO_GRADIENT_MODEL_ACCESS_KEY;
  if (!key) {
    throw new Error('Missing DO_GRADIENT_MODEL_ACCESS_KEY. Create a Gradient model access key and add it to your environment.');
  }
  return key;
}

export function getGradientTextModel(): string {
  return process.env.DO_GRADIENT_TEXT_MODEL || DEFAULT_TEXT_MODEL;
}

export function getGradientVisionModel(): string {
  return process.env.DO_GRADIENT_VISION_MODEL || DEFAULT_VISION_MODEL;
}

export async function requestGradientChatCompletion(
  request: GradientCompletionRequest
): Promise<GradientCompletionResponse> {
  const primaryUrl = (process.env.DO_GRADIENT_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  const backupUrl = DEFAULT_BASE_URL.replace(/\/$/, '');
  const apiKey = getModelAccessKey();

  const makeRequest = async (baseUrl: string) => {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: request.model || getGradientTextModel(),
        messages: request.messages,
        temperature: request.temperature ?? 0.2,
        max_completion_tokens: request.maxCompletionTokens ?? 600,
      }),
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const errorMessage =
        (payload as { error?: { message?: string } } | null)?.error?.message ||
        `Gradient API request failed (${response.status})`;
      throw new Error(errorMessage);
    }

    const content =
      (payload as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Gradient API response did not include assistant text content.');
    }

    return { content, raw: payload };
  };

  try {
    return await makeRequest(primaryUrl);
  } catch (error) {
    if (primaryUrl !== backupUrl) {
      console.warn(`[GradientAi] Primary inference failed, falling back to Serverless Inference:`, error);
      return await makeRequest(backupUrl);
    }
    throw error;
  }
}

export function extractJsonObjectFromText(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();

  const candidates: string[] = [trimmed];
  candidates.push(trimmed.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim());

  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch?.[0]) {
    candidates.push(jsonMatch[0]);
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}
