import { NextRequest, NextResponse } from 'next/server';

interface MemoryData {
  environment?: string;
  objects_seen?: string[];
  user_goal?: string;
  recent_observations?: string[];
}

interface MemoryRecord {
  data: MemoryData;
  updatedAt: string;
  expiresAt: number;
}

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

declare global {
  var __gradientLensMemoryStore: Map<string, MemoryRecord> | undefined;
}

function getMemoryStore(): Map<string, MemoryRecord> {
  if (!globalThis.__gradientLensMemoryStore) {
    globalThis.__gradientLensMemoryStore = new Map<string, MemoryRecord>();
  }
  return globalThis.__gradientLensMemoryStore;
}

function getTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.MEMORY_TTL_SECONDS || '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_TTL_SECONDS;
}

/**
 * GET /api/memory?sessionId=xxx
 * Retrieves in-memory session data.
 */
export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  try {
    const store = getMemoryStore();
    const record = store.get(sessionId);
    if (!record) {
      return NextResponse.json({ data: null });
    }

    if (record.expiresAt < Date.now()) {
      store.delete(sessionId);
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({ data: record.data });
  } catch (error) {
    console.error('[/api/memory] GET error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve session memory' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/memory
 * Saves session memory in process memory.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, data } = body as { sessionId: string; data: MemoryData };

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const store = getMemoryStore();
    const now = Date.now();
    const expiresAt = now + getTtlSeconds() * 1000;
    store.set(sessionId, {
      data,
      updatedAt: new Date(now).toISOString(),
      expiresAt,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[/api/memory] POST error:', error);
    return NextResponse.json(
      { error: 'Failed to save session memory' },
      { status: 500 }
    );
  }
}
