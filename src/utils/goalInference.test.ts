import { inferGoalFromQuestion } from './goalInference';

describe('inferGoalFromQuestion', () => {
  it('extracts a target from where-is queries', () => {
    expect(inferGoalFromQuestion('Where is the baseball in frame?')).toBe('baseball');
  });

  it('extracts a target from find queries including the verb', () => {
    expect(inferGoalFromQuestion('Find my red water bottle')).toBe('find red water bottle');
  });

  it('extracts a target from the rubber duck query', () => {
    expect(inferGoalFromQuestion('can you help me find my rubber duck')).toBe('find rubber duck');
  });

  it('returns null for broad questions without a target', () => {
    expect(inferGoalFromQuestion('What do you see right now?')).toBeNull();
  });

  it('does not infer goals from casual conversation', () => {
    expect(inferGoalFromQuestion('Thanks for your help')).toBeNull();
    expect(inferGoalFromQuestion('That is great')).toBeNull();
    expect(inferGoalFromQuestion('I am just looking around')).toBeNull();
    expect(inferGoalFromQuestion('Sounds good')).toBeNull();
  });

  it('does not infer goals from generic subjects like "what i see"', () => {
    expect(inferGoalFromQuestion('can you see what I see')).toBeNull();
    expect(inferGoalFromQuestion('can you see what I am pointing the camera at')).toBeNull();
    expect(inferGoalFromQuestion('do you see what i m looking at')).toBeNull();
    expect(inferGoalFromQuestion('show me what i see')).toBeNull();
  });
});
