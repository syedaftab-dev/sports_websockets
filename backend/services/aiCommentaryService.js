// services/aiCommentaryService.js
import "dotenv/config";
import { Groq } from "groq-sdk";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY is required in .env');
}

const groq = new Groq({ apiKey: GROQ_API_KEY });

/**
 * Build prompt for a given event.
 * @param {object} ev - Normalised event with fields: eventType, player, minute, sport, teamA, teamB
 * @returns {string}
 */
function buildPrompt(ev) {
  const lines = [];
  lines.push(`Generate an exciting live commentary for a ${ev.sport} event.`);
  if (ev.player) lines.push(`Player: ${ev.player}`);
  if (ev.eventType) lines.push(`Event: ${ev.eventType}`);
  if (ev.minute) lines.push(`Minute: ${ev.minute}`);
  lines.push('Style: Professional');
  return lines.join('\n');
}

/**
 * Generate commentary via Groq.
 * @param {object} ev - Normalised event.
 * @returns {Promise<string>} generated text.
 */
export async function generateCommentary(ev) {
  const prompt = buildPrompt(ev);
  try {
    const chat = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.1-8b-instant', // fast, free-tier model
      temperature: 0.7,
    });
    const text = chat.choices?.[0]?.message?.content?.trim();
    return text || '';
  } catch (err) {
    console.error('Groq commentary generation error:', err);
    return '';
  }
}
