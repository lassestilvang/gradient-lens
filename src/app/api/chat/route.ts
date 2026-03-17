import { NextRequest, NextResponse } from 'next/server';
import { getGradientTextModel, requestGradientChatCompletion } from '@/services/gradientAi';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  memoryContext?: string;
  userGoal?: string;
  context?: string;
}

function buildSystemPrompt(memoryContext?: string, userGoal?: string): string {
  let prompt = `You are GradientLens, a real-time assistive AI helper for people with low vision.

Rules:
1. Be concise and conversational.
2. If confidence is low, say so clearly instead of guessing.
3. For medical, legal, or financial questions, add a short safety disclaimer.
4. Prioritize practical guidance over abstract explanations.`;

  if (userGoal?.trim()) {
    prompt += `\n\nCurrent user goal: ${userGoal.trim()}`;
  }

  if (memoryContext?.trim()) {
    prompt += `\n\nRecent memory context:\n${memoryContext.trim()}`;
  }

  return prompt;
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();

    if (!body.message?.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const history = (body.history || [])
      .filter((entry) => entry && typeof entry.content === 'string')
      .slice(-10)
      .map((entry) => ({ role: entry.role, content: entry.content }));

    const completion = await requestGradientChatCompletion({
      model: getGradientTextModel(),
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt(body.memoryContext, body.userGoal),
        },
        ...history,
        {
          role: 'user',
          content: body.context?.trim()
            ? `${body.message.trim()}\n\nAdditional context:\n${body.context.trim()}`
            : body.message.trim(),
        },
      ],
      temperature: 0.2,
      maxCompletionTokens: 450,
    });

    return NextResponse.json({ text: completion.content });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Chat failed';
    const status = message.toLowerCase().includes('rate limit') ? 429 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
