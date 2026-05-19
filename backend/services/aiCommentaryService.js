// services/aiCommentaryService.js
import "dotenv/config";
import { Groq } from "groq-sdk";

const GROQ_API_KEY = process.env.GROQ_API_KEY;
if (!GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY is required in .env');
}

const groq = new Groq({ apiKey: GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a professional cricket analyst and Cricbuzz-style live text commentator.
Your task is to write clean, concise, and professional cricket analysis based on the raw ball description.

CRITICAL RULES:
1. Do NOT write in ALL CAPS. Use standard sentence casing.
2. Do NOT include any parenthesized stage directions, actions, sound effects, or visual cues (e.g. NO "(excited voice)", NO "(On-air display shows...)", NO "(Crowd noise intensifies)", NO "(Pause for score)").
3. Do NOT include speaker labels like "AI:", "Commentator:", or "Commentator 1:".
4. Keep the commentary concise (1 to 2 sentences max).
5. Output ONLY the commentary text. No other conversational filler.

Example Input:
[Overs 14.2] Yuzvendra Chahal to Jos Buttler, SIX! Lofted clean over long-on! Massive hit! (Score: 126/3)

Example Output:
Chahal tosses this one up slightly, and Buttler reads the flight perfectly. He gets underneath the ball and lofts it cleanly over long-on for a massive six.

Example Input:
[Overs 49.2] Ravi Bishnoi to KL Rahul, OUT! Clean bowled! The stump is cartwheeling! (Score: 283/9)

Example Output:
A brilliant delivery from Bishnoi! He beats Rahul with a superb googly that sneaks right through the gate. The off-stump is sent cartwheeling.`;

/**
 * Generate commentary via Groq.
 * @param {object} ev - Normalised event.
 * @returns {Promise<string>} generated text.
 */
export async function generateCommentary(ev) {
  const userInput = `Raw Ball Description:
${ev.player} (Event: ${ev.eventType})`;

  try {
    const chat = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
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
