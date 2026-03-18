import {
  requestGradientChatCompletion,
  DEFAULT_BASE_URL,
} from './gradientAi';

// Mock global fetch
global.fetch = jest.fn();

describe('Gradient AI Service', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.DO_GRADIENT_MODEL_ACCESS_KEY = mockApiKey;
    process.env.DO_GRADIENT_BASE_URL = 'https://primary.ai';
    process.env.DO_GRADIENT_TEXT_MODEL = 'custom-text-model';
    process.env.DO_GRADIENT_VISION_MODEL = 'custom-vision-model';
  });

  it('uses the custom model on primary URL when it succeeds', async () => {
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Primary response' } }],
      }),
    });

    const result = await requestGradientChatCompletion({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = (fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://primary.ai/v1/chat/completions');
    
    const body = JSON.parse(options.body);
    expect(body.model).toBe('custom-text-model');
    expect(result.content).toBe('Primary response');
  });

  it('falls back to DEFAULT_TEXT_MODEL on serverless URL when primary fails (text request)', async () => {
    // First call fails
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Primary down' } }),
    });

    // Second call (fallback) succeeds
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Fallback response' } }],
      }),
    });

    const result = await requestGradientChatCompletion({
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    
    // Check fallback call
    const [url, options] = (fetch as jest.Mock).mock.calls[1];
    expect(url).toBe(`${DEFAULT_BASE_URL}/v1/chat/completions`);
    
    const body = JSON.parse(options.body);
    expect(body.model).toBe('llama3.3-70b-instruct'); // DEFAULT_TEXT_MODEL
    expect(result.content).toBe('Fallback response');
  });

  it('falls back to DEFAULT_VISION_MODEL on serverless URL when primary fails (vision request)', async () => {
    // First call fails
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Primary down' } }),
    });

    // Second call (fallback) succeeds
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Vision fallback response' } }],
      }),
    });

    const result = await requestGradientChatCompletion({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is this?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
          ],
        },
      ],
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    
    // Check fallback call
    const [url, options] = (fetch as jest.Mock).mock.calls[1];
    expect(url).toBe(`${DEFAULT_BASE_URL}/v1/chat/completions`);
    
    const body = JSON.parse(options.body);
    expect(body.model).toBe('openai-gpt-4o-mini'); // DEFAULT_VISION_MODEL
    expect(result.content).toBe('Vision fallback response');
  });

  it('ignores explicitly requested model and uses defaults on fallback', async () => {
     // First call fails
     (fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: 'Primary down' } }),
    });

    // Second call (fallback) succeeds
    (fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Fallback response' } }],
      }),
    });

    const result = await requestGradientChatCompletion({
      model: 'very-specific-model',
      messages: [{ role: 'user', content: 'Hello' }],
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    
    // Check primary call used the specific model
    const [, optionsPrimary] = (fetch as jest.Mock).mock.calls[0];
    expect(JSON.parse(optionsPrimary.body).model).toBe('very-specific-model');

    // Check fallback call used the default model
    const [url, optionsFallback] = (fetch as jest.Mock).mock.calls[1];
    expect(url).toBe(`${DEFAULT_BASE_URL}/v1/chat/completions`);
    expect(JSON.parse(optionsFallback.body).model).toBe('llama3.3-70b-instruct');
  });
});
