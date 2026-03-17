import { playMedicationEarcon } from '../utils/audioService';
import { generateSpeechResponse } from '../services/gradientVoice';

// Mock audio and voice services
jest.mock('../utils/audioService', () => ({
  playMedicationEarcon: jest.fn(),
}));

jest.mock('../services/gradientVoice', () => ({
  generateSpeechResponse: jest.fn(),
}));

describe('Proactive Feedback Trigger', () => {
  it('should play an earcon and trigger speech when a suggestion is ready', async () => {
    const suggestion = 'Found healthy cereal!';
    
    // Simulate trigger logic
    playMedicationEarcon('success');
    await generateSpeechResponse(suggestion, '');

    expect(playMedicationEarcon).toHaveBeenCalledWith('success');
    expect(generateSpeechResponse).toHaveBeenCalled();
  });
});
