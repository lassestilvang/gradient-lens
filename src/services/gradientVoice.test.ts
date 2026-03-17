/**
 * @jest-environment node
 */
import { generateSpeechResponse } from './gradientVoice'

describe('gradientVoice', () => {
  it('generates a voice response from user text/audio input', async () => {
    const inputPrompt = "What is healthier, Cheerios or Frosted Flakes?"
    const contextStr = "Recent observations:\n- Saw Cheerios\n- Saw Frosted Flakes"
    
    const response = await generateSpeechResponse(inputPrompt, contextStr)
    
    expect(response).toHaveProperty('audioBuffer')
    expect(response.audioBuffer).toBeInstanceOf(Buffer)
    expect(response).toHaveProperty('textResponse')
    expect(typeof response.textResponse).toBe('string')
  })

  it('throws an error when input prompt is empty', async () => {
    await expect(generateSpeechResponse('', '')).rejects.toThrow('Input prompt is required')
  })
})