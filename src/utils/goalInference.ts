/**
 * Extracts a likely search target from a natural-language visual query.
 * Returns null when no clear object target can be inferred.
 */
export function inferGoalFromQuestion(question: string): string | null {
  const normalized = question.toLowerCase().trim();
  if (!normalized) {
    return null;
  }

  const genericPhrases = new Set([
    'anything',
    'anything else',
    'right now',
    'there',
    'this',
    'that',
  ]);

  const patterns = [
    // Capture specific target-oriented verbs: find, search, locate, look for
    /(find|locate|look for|spot|search for)\s+(?:the|a|an|my)?\s*([a-z0-9][a-z0-9\s-]{1,40})/,
    // Generic where/see queries (keep existing behavior for these)
    /(?:where(?:'s| is)|do you see)\s+(?:the|a|an|my)?\s*([a-z0-9][a-z0-9\s-]{1,40})/,
    /(?:is there|can you see|show me)\s+(?:the|a|an)?\s*([a-z0-9][a-z0-9\s-]{1,40})/,
    // Fallback: Just capture the whole string if it's short and looks like an object
    /^([a-z0-9][a-z0-9\s-]{1,40})$/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);
    if (!match) continue;
    
    // If the first group is a verb (from the first regex), include it
    // match[1] will be the verb if it's the first regex, otherwise match[1] is the object
    const isVerbMatch = /(find|locate|look for|spot|search for)/.test(match[1]);
    const verb = isVerbMatch ? match[1] : '';
    const rawObject = isVerbMatch ? match[2] : match[1];

    if (!rawObject) continue;

    const cleanedObject = rawObject
      .replace(/\b(in|on|at|for|near|around|to)\b.*$/, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim();

    if (cleanedObject.length >= 3 && !genericPhrases.has(cleanedObject)) {
      return verb ? `${verb} ${cleanedObject}` : cleanedObject;
    }
  }

  return null;
}
