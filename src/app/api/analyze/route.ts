import { NextRequest, NextResponse } from 'next/server';
import {
  extractJsonObjectFromText,
  getGradientVisionModel,
  requestGradientChatCompletion,
} from '@/services/gradientAi';

interface AnalyzeRequest {
  image: string; // base64-encoded JPEG
  mode: 'grocery' | 'document' | 'medication' | 'environment';
  question?: string;
}

function normalizeImageDataUrl(image: string): string {
  const trimmed = image.trim();
  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }
  return `data:image/jpeg;base64,${trimmed}`;
}

function getPromptForMode(mode: string, question?: string): string {
  const baseRules = `
CRITICAL RULES:
1. If text is blurry or partially obscured, you MUST state "I cannot read this clearly". Do NOT guess or interpolate missing words.
2. Only list objects you are highly confident exist in the frame.
3. Include a confidence score (0-1) for each extracted field and omit low-confidence entities.
4. If confidence is low for safety-critical content, say so instead of guessing.
`;

  switch (mode) {
    case 'grocery':
      return `Analyze the image of a grocery store or product shelf.

Describe:
- objects present (product names, brands)
- visible text (labels, prices)
- environment type

Return your response as valid JSON with this exact structure:
{"objects": ["string"], "text": "string", "environment": "string", "confidence": 0.0}

${baseRules}
${question ? `\nThe user specifically asks: "${question}"` : ''}`;

    case 'document':
      return `Perform high-precision OCR on this document image.

Identify the document type and extract all visible text.

Return your response as valid JSON with this exact structure:
{"fullText": "string", "documentType": "string", "confidence": 0.0}

${baseRules}`;

    case 'medication':
      return `Analyze the image of a medication label.

Describe:
- medication name
- strength (e.g., 400mg)
- dosage instructions

Return your response as valid JSON with this exact structure:
{"name": "string", "strength": "string", "dosage": "string", "confidence": 0.0}

${baseRules}
ADDITIONAL SAFETY RULE: If ANY dosage information is unclear, you MUST state "I cannot read this clearly. Please do not guess." Do NOT interpolate missing dosage data.`;

    case 'environment':
      return `Analyze the environment in this image for safety-critical objects and general context.

Identify:
- safety-critical objects (traffic lights, crossings, obstacles, vehicles, warning signs)
- general scene context (location type, conditions)

Return your response as valid JSON with this exact structure:
{"safetyObjects": ["string"], "sceneContext": "string", "confidence": 0.0}

${baseRules}`;

    default:
      return `Analyze this image. Return JSON with "objects", "text", "environment", and "confidence" fields.\n${baseRules}`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: AnalyzeRequest = await request.json();

    if (!body.image) {
      return NextResponse.json({ error: 'Image data is required' }, { status: 400 });
    }

    if (!body.mode) {
      return NextResponse.json({ error: 'Mode is required' }, { status: 400 });
    }

    const prompt = getPromptForMode(body.mode, body.question);
    const dataUrl = normalizeImageDataUrl(body.image);

    const completion = await requestGradientChatCompletion({
      model: getGradientVisionModel(),
      messages: [
        {
          role: 'system',
          content: 'You are GradientLens vision analysis. Follow the user instructions and return only valid JSON.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      maxCompletionTokens: 700,
    });

    const parsed = extractJsonObjectFromText(completion.content) || { raw: completion.content };
    return NextResponse.json(parsed);
  } catch (error) {
    console.error('[/api/analyze] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Analysis failed';

    if (errorMessage.includes('DO_GRADIENT_MODEL_ACCESS_KEY')) {
      return NextResponse.json(
        {
          error: 'DigitalOcean Gradient AI access key is not configured on the server.',
          code: 'CONFIG_ERROR',
        },
        { status: 500 }
      );
    }

    if (errorMessage.toLowerCase().includes('rate limit')) {
      return NextResponse.json(
        {
          error: 'Too many requests — please wait a moment and try again.',
          code: 'THROTTLED',
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      {
        error: 'Analysis failed — please try again.',
        code: 'INTERNAL_ERROR',
      },
      { status: 500 }
    );
  }
}
