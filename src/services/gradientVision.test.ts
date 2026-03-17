/**
 * @jest-environment node
 */
import { analyzeFrame } from './gradientVision'

describe('gradientVision', () => {
  it('extracts objects and text from a base64 image', async () => {
    // We mock the fetch or DigitalOcean SDK call inside the analyzeFrame implementation later
    const mockImage = 'base64-encoded-image-data'
    const result = await analyzeFrame(mockImage)

    expect(result).toHaveProperty('objects')
    expect(Array.isArray(result.objects)).toBe(true)
    expect(result).toHaveProperty('text')
    expect(typeof result.text).toBe('string')
    expect(result).toHaveProperty('environment')
    expect(typeof result.environment).toBe('string')
  })

  it('handles errors when analysis fails', async () => {
    // In a real implementation this would mock an DigitalOcean rejection
    await expect(analyzeFrame('')).rejects.toThrow('Invalid image data')
  })
})