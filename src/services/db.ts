import Redis from 'ioredis';

const mockStore = new Map<string, unknown>();
let redis: Redis | null = null;

if (process.env.REDIS_URL && process.env.NODE_ENV !== 'test') {
  try {
    redis = new Redis(process.env.REDIS_URL);
  } catch (err) {
    console.error('Failed to initialize Redis:', err);
  }
}

/**
 * Saves session memory. Browser clients use `/api/memory`; tests and server utilities
 * use Redis (if configured) or fall back to an in-process map.
 */
export async function saveSessionMemory(sessionId: string, data: unknown): Promise<void> {
  if (process.env.NODE_ENV === 'test' || typeof window === 'undefined') {
    if (redis) {
      await redis.set(sessionId, JSON.stringify(data));
      const ttl = parseInt(process.env.MEMORY_TTL_SECONDS || '86400', 10);
      await redis.expire(sessionId, ttl);
    } else {
      mockStore.set(sessionId, data);
    }
    return;
  }

  const response = await fetch('/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, data }),
  });

  if (!response.ok) {
    throw new Error(`Memory save failed: ${response.status}`);
  }
}

/**
 * Retrieves session memory. Browser clients use `/api/memory`; tests and server
 * utilities read from Redis or the in-process map.
 */
export async function getSessionMemory(sessionId: string): Promise<unknown | null> {
  if (process.env.NODE_ENV === 'test' || typeof window === 'undefined') {
    if (redis) {
      const data = await redis.get(sessionId);
      return data ? JSON.parse(data) : null;
    }
    return mockStore.get(sessionId) || null;
  }

  const response = await fetch(`/api/memory?sessionId=${encodeURIComponent(sessionId)}`);
  if (!response.ok) {
    throw new Error(`Memory load failed: ${response.status}`);
  }

  const result = (await response.json()) as { data?: unknown };
  return result.data ?? null;
}
