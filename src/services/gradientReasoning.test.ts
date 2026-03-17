/**
 * @jest-environment node
 */
import { invokeGradientReasoning } from './gradientReasoning';

describe('Gradient AI tool orchestration Service Wrapper', () => {
  it('should structure a tool-use request for DigitalOcean Gradient AI', async () => {
    const messages = [{ role: 'user', content: 'What is the price of milk?' }];
    const tools = [
      {
        name: 'search_prices',
        description: 'Search for current grocery prices',
        input_schema: { type: 'object', properties: { item: { type: 'string' } } }
      }
    ];

    const result = await invokeGradientReasoning(messages, tools);

    expect(result).toHaveProperty('tool_use');
    expect(result.tool_use.name).toBe('search_prices');
  });

  it('should throw error for empty messages', async () => {
    await expect(invokeGradientReasoning([], [])).rejects.toThrow('Messages are required');
  });
});
