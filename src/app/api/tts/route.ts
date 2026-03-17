import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const piperUrl = process.env.PIPER_TTS_URL;
    if (!piperUrl) {
      return NextResponse.json(
        { error: 'Piper TTS URL not configured' },
        { status: 500 }
      );
    }

    // Call the self-hosted Piper service
    // Piper typically accepts a 'text' query param or JSON and returns a WAV file
    const response = await fetch(`${piperUrl}?text=${encodeURIComponent(text)}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`Piper service failed: ${response.statusText}`);
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
