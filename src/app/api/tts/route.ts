import { NextRequest, NextResponse } from 'next/server';

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

    // Call the self-hosted Kokoro service (OpenAI-compatible)
    const response = await fetch(kokoroUrl, {
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
      throw new Error(`Kokoro service failed: ${response.statusText}`);
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
