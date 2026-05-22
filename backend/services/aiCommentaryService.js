// services/aiCommentaryService.js
import "dotenv/config";
import { Groq } from "groq-sdk";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY is required in .env');
}

const groq = new Groq({ apiKey: GROQ_API_KEY });

function getSystemPrompt(sport) {
  const sportLower = (sport || 'soccer').toLowerCase();

  if (sportLower === 'basketball') {
    return `You are a professional NBA basketball analyst and ESPN-style live text commentator.
Your task is to write clean, concise, and professional basketball play-by-play analysis based on the raw play description.

CRITICAL RULES:
1. Do NOT write in ALL CAPS. Use standard sentence casing.
2. Do NOT include any parenthesized stage directions, actions, sound effects, or visual cues.
3. Do NOT include speaker labels like "AI:", "Commentator:", or "Commentator 1:".
4. Keep the commentary concise (1 to 2 sentences max).
5. Output ONLY the commentary text. No other conversational filler.
6. Use basketball terms (e.g. court, rim, dunk, three-pointer, assist, rebound, paint, transition). Do NOT use cricket terms like wickets, boundaries, overs, runs, batsmen, etc.`;
  }

  if (sportLower === 'baseball') {
    return `You are a professional MLB baseball analyst and ESPN-style live text commentator.
Your task is to write clean, concise, and professional baseball play-by-play analysis based on the raw play description.

CRITICAL RULES:
1. Do NOT write in ALL CAPS. Use standard sentence casing.
2. Do NOT include any parenthesized stage directions, actions, sound effects, or visual cues.
3. Do NOT include speaker labels like "AI:", "Commentator:", or "Commentator 1:".
4. Keep the commentary concise (1 to 2 sentences max).
5. Output ONLY the commentary text. No other conversational filler.
6. Use baseball terms (e.g. pitch, bat, home run, strike, ball, outfield, infield, base, inning, runner). Do NOT use cricket terms like wickets, boundaries, overs, batsmen, etc.`;
  }

  if (sportLower === 'soccer' || sportLower === 'football') {
    return `You are a professional soccer (football) analyst and ESPN-style live text commentator.
Your task is to write clean, concise, and professional soccer play-by-play analysis based on the raw play description.

CRITICAL RULES:
1. Do NOT write in ALL CAPS. Use standard sentence casing.
2. Do NOT include any parenthesized stage directions, actions, sound effects, or visual cues.
3. Do NOT include speaker labels like "AI:", "Commentator:", or "Commentator 1:".
4. Keep the commentary concise (1 to 2 sentences max).
5. Output ONLY the commentary text. No other conversational filler.
6. Use soccer terms (e.g. pitch, goal, pass, tackle, goalkeeper, penalty, corner, cross, header). Do NOT use cricket terms like wickets, boundaries, overs, batsmen, etc.`;
  }

  // Default to Cricket
  return `You are a professional cricket analyst and Cricbuzz-style live text commentator.
Your task is to write clean, concise, and professional cricket analysis based on the raw ball description.

CRITICAL RULES:
1. Do NOT write in ALL CAPS. Use standard sentence casing.
2. Do NOT include any parenthesized stage directions, actions, sound effects, or visual cues.
3. Do NOT include speaker labels like "AI:", "Commentator:", or "Commentator 1:".
4. Keep the commentary concise (1 to 2 sentences max).
5. Output ONLY the commentary text. No other conversational filler.`;
}

/**
 * Generate commentary via Groq.
 * @param {object} ev - Normalised event.
 * @returns {Promise<string>} generated text.
 */
export async function generateCommentary(ev) {
  const systemPrompt = getSystemPrompt(ev.sport);
  const userInput = `Raw Play Description:
${ev.player} (Event: ${ev.eventType})`;

  try {
    const chat = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userInput }
      ],
      model: 'llama-3.1-8b-instant', // fast, free-tier model
      temperature: 0.5, // lower temperature for more direct, structured output
    });
    const text = chat.choices?.[0]?.message?.content?.trim();
    return text || '';
  } catch (err) {
    console.error('Groq commentary generation error:', err);
    return '';
  }
}
