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
    // Piper rhasspy/piper typically accepts 'text' query param at root
    const cleanBaseUrl = piperUrl.replace(/\/$/, '');
    const url = new URL(cleanBaseUrl);
    url.searchParams.set('text', text);
    // Some versions might require voice to be explicit if model directory has many
    // url.searchParams.set('voice', 'en_US-amy-medium'); 

    const response = await fetch(url.toString(), {
      method: 'GET',
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[API/TTS] Piper failed (${response.status}):`, errorText);
      throw new Error(`Piper service failed: ${response.statusText}`);
    }

    const contentType = response.headers.get('Content-Type');
    if (!contentType?.includes('audio')) {
       console.warn(`[API/TTS] Unexpected content type from Piper: ${contentType}. Service might be showing help page.`);
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
