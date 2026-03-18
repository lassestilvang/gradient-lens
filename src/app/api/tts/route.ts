import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_BASE_URL, getModelAccessKey } from '@/services/gradientAi';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const kokoroUrl = process.env.KOKORO_TTS_URL;
    if (!kokoroUrl) {
      return NextResponse.json(
        { error: 'Kokoro TTS URL not configured' },
        { status: 500 }
      );
    }

    console.log(`[API/TTS] Calling Kokoro: ${kokoroUrl}`);

    let response: Response | null = null;
    let primaryFailed = false;

    try {
      // Call the self-hosted Kokoro service (OpenAI-compatible)
      console.log(`[API/TTS] Attempting primary TTS at ${kokoroUrl}...`);
      response = await fetch(kokoroUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'kokoro',
          input: text,
          voice: 'af_heart', // Standard high-quality female voice
          response_format: 'wav'
        }),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error(`[API/TTS] Kokoro failed (${response.status}):`, errorText);
        primaryFailed = true;
      }
    } catch (e) {
      console.error(`[API/TTS] Kokoro fetch connection error:`, {
        message: e instanceof Error ? e.message : 'Unknown error',
        url: kokoroUrl,
        error: e
      });
      primaryFailed = true;
    }

    if (primaryFailed) {
      console.warn(`[API/TTS] Primary Kokoro failed, falling back to DO Serverless Inference (if available)...`);
      // NOTE: inference.do-ai.run may not support /v1/audio/speech. 
      // If it fails, we will report the actual error from it.
      const backupUrl = `${DEFAULT_BASE_URL.replace(/\/$/, '')}/v1/audio/speech`;
      const apiKey = getModelAccessKey();
      
      try {
        response = await fetch(backupUrl, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: 'tts-1', 
            input: text,
            voice: 'alloy', 
            response_format: 'wav'
          }),
        });

        if (!response.ok) {
          const errorText = await response.text().catch(() => 'Unknown error');
          console.error(`[API/TTS] Fallback failed (${response.status}):`, errorText);
          throw new Error(`TTS service unreachable. Primary (Kokoro) failed and fallback (Inference) returned ${response.status}. Please check your KOKORO_TTS_URL and firewall settings.`);
        }
      } catch (fallbackError) {
        console.error(`[API/TTS] Both TTS services failed.`, fallbackError);
        throw fallbackError;
      }
    }

    if (!response) {
      throw new Error('Failed to obtain a response from any TTS service.');
    }

    const audioBuffer = await response.arrayBuffer();

    return new NextResponse(audioBuffer, {
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    console.error('[API/TTS] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate audio' },
      { status: 500 }
    );
  }
}
