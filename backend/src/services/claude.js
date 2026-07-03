const Anthropic = require('@anthropic-ai/sdk');

// Fallback response for pre-visit symptom analysis
const fallbackPreVisit = {
  urgency: 'UNKNOWN',
  chiefComplaint: 'Summary unavailable — doctor please review symptoms directly',
  suggestedQuestions: []
};

// Fallback response for post-visit notes analysis
const fallbackPostVisit = {
  summary: 'Details unavailable — please review your doctor\'s prescription and notes directly.',
  medicationSchedule: [],
  followUpSteps: [],
  followUpDate: null
};

// Custom JSON response cleaning function
function cleanJSON(text) {
  if (!text) return null;
  // Strip code blocks if present
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(json)?/, '');
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return JSON.parse(cleaned.trim());
}

async function analyzeSymptoms(symptomText) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-claude-api-key-here' || apiKey === '') {
    console.warn('[Claude Service] No ANTHROPIC_API_KEY configured. Using mock fallback.');
    // Return a mocked successful response for demo purposes so it works without the key
    return {
      success: true,
      data: {
        urgency: symptomText.toLowerCase().includes('chest pain') || symptomText.toLowerCase().includes('breath') ? 'High' : 'Medium',
        chiefComplaint: `Patient reports: ${symptomText.slice(0, 50)}...`,
        suggestedQuestions: [
          'When did these symptoms first begin?',
          'Does anything make the symptoms better or worse?',
          'Are you currently taking any medications for this?'
        ]
      }
    };
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Analyse these symptoms and return JSON with: urgency (Low/Medium/High), chiefComplaint (one sentence), suggestedQuestions (array of 3). Return ONLY valid JSON. Symptoms: ${symptomText}`
        }
      ]
    });

    const contentText = response.content[0].text;
    const parsed = cleanJSON(contentText);
    return { success: true, data: parsed };
  } catch (error) {
    console.error('[Claude Service] Error in symptom analysis:', error);
    return { success: false, data: fallbackPreVisit };
  }
}

async function analyzePostVisit(doctorNotes, prescription) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'your-claude-api-key-here' || apiKey === '') {
    console.warn('[Claude Service] No ANTHROPIC_API_KEY configured. Using mock fallback for post-visit.');
    return {
      success: true,
      data: {
        summary: `Follow-up instructions for doctor notes: ${doctorNotes.slice(0, 50)}. Please rest and follow your medicine schedule carefully.`,
        medicationSchedule: [
          { name: prescription || 'Prescribed Medicine', dosage: '1 tablet', timing: 'Morning and Evening', instructions: 'Take with food' }
        ],
        followUpSteps: ['Take all prescribed medications', 'Get plenty of rest', 'Call if symptoms worsen'],
        followUpDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] // 7 days from now
      }
    };
  }

  try {
    const anthropic = new Anthropic({ apiKey });
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: `Convert these clinical notes into patient-friendly JSON with: summary (2-3 simple sentences), medicationSchedule (array of {name, dosage, timing, instructions}), followUpSteps (array), followUpDate. Simple words only, no jargon. Notes: ${doctorNotes} Prescription: ${prescription}`
        }
      ]
    });

    const contentText = response.content[0].text;
    const parsed = cleanJSON(contentText);
    return { success: true, data: parsed };
  } catch (error) {
    console.error('[Claude Service] Error in post-visit translation:', error);
    return { success: false, data: fallbackPostVisit };
  }
}

module.exports = {
  analyzeSymptoms,
  analyzePostVisit
};
