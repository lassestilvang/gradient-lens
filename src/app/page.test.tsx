import { render, screen } from '@testing-library/react';
import Page from './page';

// Mock services that use DigitalOcean SDK
jest.mock('../services/gradientVision', () => ({
  analyzeFrame: jest.fn(),
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

describe('UI Shell', () => {
  it('renders the GradientLens main container', () => {
    render(<Page />)
    const heading = screen.getByRole('heading', { name: /GradientLens/i })
    expect(heading).toBeInTheDocument()
    
    // There should be a container for camera stream
    const cameraContainer = screen.getByTestId('camera-container')
    expect(cameraContainer).toBeInTheDocument()

    // There should be a status indicator
    const statusIndicator = screen.getByTestId('status-indicator')
    expect(statusIndicator).toBeInTheDocument()
  })
})