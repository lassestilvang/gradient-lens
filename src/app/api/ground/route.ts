import { NextRequest, NextResponse } from 'next/server';
import {
  extractJsonObjectFromText,
  getGradientTextModel,
  requestGradientChatCompletion,
} from '@/services/gradientAi';

interface GroundRequest {
  query: string;
  context?: string; // visual context from scene analysis
  scenario?: 'grocery' | 'medical' | 'general';
}

export async function POST(request: NextRequest) {
  try {
    const body: GroundRequest = await request.json();

    if (!body.query) {
      return NextResponse.json({ error: 'Query is required' }, { status: 400 });
    }

    const prompt = buildGroundingPrompt(body);

    const completion = await requestGradientChatCompletion({
      model: getGradientTextModel(),
      messages: [
        {
          role: 'system',
          content: 'You are a grounded fact-checking assistant. Return valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      maxCompletionTokens: 600,
    });

    const parsed =
      extractJsonObjectFromText(completion.content) ||
      { verified_fact: completion.content, source: 'DigitalOcean Gradient AI reasoning' };
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('[/api/ground] Error:', error);

    // Graceful fallback as per the failure-mode matrix
    return NextResponse.json({
      verified_fact: null,
      source: null,
      fallback: true,
      message: 'External verification could not be completed. Answer is based only on visible text.',
      debug: error instanceof Error ? { name: error.name, message: error.message } : error,
    });
  }
}

function buildGroundingPrompt(req: GroundRequest): string {
  let prompt = `You are a fact-verification assistant. Your job is to evaluate the following claim or question using your knowledge and provide a grounded, verified response.

RULES:
1. Only state facts you are confident about.
2. If you are uncertain, say "I cannot verify this with high confidence."
3. Always cite the basis for your answer (e.g., "Based on general nutritional knowledge..." or "Based on the visible label text...").
4. For medical information, ALWAYS include: "Please consult a healthcare professional for definitive advice."

Return your response as valid JSON: {"verified_fact": "string", "confidence": 0.0, "source": "string"}

`;

  if (req.context) {
    prompt += `Visual context from the scene:\n${req.context}\n\n`;
  }

  prompt += `Question/Claim to verify:\n${req.query}`;

  return prompt;
}
