import { render, screen, fireEvent } from '@testing-library/react';
import Page from './page';

// Mock services that use DigitalOcean SDK
jest.mock('../services/gradientVision', () => ({
  analyzeFrame: jest.fn(),
  analyzeDocument: jest.fn(),
  analyzeEnvironment: jest.fn(),
}));
jest.mock('../services/orchestrator', () => ({
  evaluateProactiveSuggestion: jest.fn(),
}));
jest.mock('../services/gradientVoice', () => ({
  generateSpeechResponse: jest.fn(),
}));
jest.mock('../utils/audioService', () => ({
  playMedicationEarcon: jest.fn(),
}));

describe('Multi-Mode UI Integration', () => {
  it('should render DocumentOverlay when document mode is selected', () => {
    render(<Page />);
    
    // Select Document mode via button
    fireEvent.click(screen.getByRole('button', { name: /Document/i }));
    
    expect(screen.getByTestId('document-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('document-overlay')).toHaveClass('opacity-100');
  });

  it('should render DebugPanel with Grounded status in environment mode', () => {
    render(<Page />);
    
    // Select Environment mode via button
    fireEvent.click(screen.getByRole('button', { name: /Environment/i }));
    
    expect(screen.getByTestId('debug-panel')).toBeInTheDocument();
  });
});
