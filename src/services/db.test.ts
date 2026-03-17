/**
 * @jest-environment node
 */
import { saveSessionMemory, getSessionMemory } from './db'

describe('session memory store Session Memory', () => {
  it('saves and retrieves session memory', async () => {
    const sessionId = 'test-session-123'
    const memory = {
      environment: 'grocery store',
      objects_seen: ['apple'],
      user_goal: 'find fruit',
      recent_observations: ['saw an apple']
    }

    await saveSessionMemory(sessionId, memory)
    
    const retrieved = await getSessionMemory(sessionId)
    expect(retrieved).toEqual(memory)
  })

  it('returns null if session does not exist', async () => {
    const retrieved = await getSessionMemory('non-existent-session')
    expect(retrieved).toBeNull()
  })
})