// Placeholder Gemini API integration
// This simulates a call to an LLM to parse/edit commands.

export async function callGemini(prompt) {
  // In production, call Gemini API with your key and model here.
  // Return a structured suggestion or action.
  const lower = (prompt || '').toLowerCase()
  if (lower.includes('cut') || lower.includes('split')) {
    return { intent: 'split', message: 'Detected split/cut intent', confidence: 0.8 }
  }
  if (lower.includes('text')) {
    return { intent: 'text', message: 'Detected text overlay intent', confidence: 0.7 }
  }
  return { intent: 'unknown', message: 'No specific edit detected', confidence: 0.4 }
}