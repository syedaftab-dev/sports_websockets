// workers/liveMatchWorker.js
import "dotenv/config";
import axios from "axios";
import { fetchLiveEvents, fetchGameSummary } from "../src/services/sportsApi.js";
import { db } from "../src/db/db.js";
import { matches, commentary } from "../src/db/schema.js";
import { eq, and } from "drizzle-orm";
import { generateCommentary } from "../services/aiCommentaryService.js";

const API_URL = process.env.API_URL || "http://127.0.0.1:8000";

// Cache for processed play IDs to prevent duplicates within the current execution session
const processedPlayIds = new Set();
function isPlayProcessed(playId) {
  return processedPlayIds.has(playId);
}
function markPlayProcessed(playId) {
  processedPlayIds.add(playId);
  if (processedPlayIds.size > 5000) {
    const first = processedPlayIds.values().next().value;
    processedPlayIds.delete(first);
  }
}

/**
 * Parses clock string and period number into match minutes.
 */
function parseClockToMinute(clockStr) {
  if (!clockStr) return 0;
  const match = clockStr.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Upsert match details from the scoreboard.
 */
async function upsertMatch(ev) {
  const { id, sport, homeTeam, awayTeam, startTime, endTime, status, homeScore, awayScore } = ev;
  if (!id) return null;

  const matchData = {
    id,
    sport,
    homeTeam,
    awayTeam,
    startTime: new Date(startTime),
    endTime: new Date(endTime),
    status,
    homeScore,
    awayScore,
  };

  try {
    const [record] = await db
      .insert(matches)
      .values(matchData)
      .returning();
    console.log(`🆕 Registered new match: ${homeTeam} vs ${awayTeam} (ID: ${id})`);
    return record;
  } catch (e) {
    // Conflict - update existing match.
    const [updated] = await db
      .update(matches)
      .set({
        status,
        homeScore,
        awayScore,
        endTime: new Date(endTime),
      })
      .where(eq(matches.id, id))
      .returning();
    return updated;
  }
}

/**
 * Processes a single play/event from a live game.
 */
async function processPlay(play, match) {
  const playId = play.id || `${match.id}-${play.sequenceNumber}`;
  if (isPlayProcessed(playId)) {
    return;
  }
  markPlayProcessed(playId);

  const minute = parseClockToMinute(play.clock?.displayValue) || play.minute || 0;
  const sequence = parseInt(play.sequenceNumber, 10) || 0;
  const period = play.period?.displayValue || "";
  const eventType = play.type?.text || "Play";
  const message = play.text || "";

  // Check the database to see if we've already saved this play
  const [existing] = await db
    .select({ id: commentary.id })
    .from(commentary)
    .where(and(eq(commentary.matchId, match.id), eq(commentary.sequence, sequence)))
    .limit(1);

  if (existing) {
    return;
  }

  // 1. Submit commentary event to local REST API
  try {
    await axios.post(`${API_URL}/matches/${match.id}/commentary`, {
      minute,
      sequence,
      period,
      eventType,
      message,
    });
    console.log(`📣 [Match ${match.id}] Play: ${message}`);
  } catch (err) {
    console.error(`Failed to submit commentary play ${playId} via API:`, err.response?.data || err.message);
  }

  // 2. Trigger AI Commentary for important events
  const isImportant = play.scoringPlay === true || 
                      /goal|three point|fouled|kickoff|red card|yellow card/i.test(eventType || "") ||
                      /goal|3-pt|three pointer/i.test(message);

  if (isImportant && process.env.GROQ_API_KEY) {
    try {
      console.log(`🤖 Generating AI Commentary for Match ${match.id} play...`);
      const aiPayload = {
        sport: match.sport,
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        eventType,
        minute,
        player: message,
      };

      const aiText = await generateCommentary(aiPayload);
      if (aiText) {
        await axios.post(`${API_URL}/matches/${match.id}/commentary`, {
          minute,
          sequence: sequence + 1, // Ensure AI commentary is right after the actual event
          period,
          eventType: "AI Commentary",
          message: `🤖 AI: ${aiText}`,
        });
        console.log(`🤖 [Match ${match.id}] AI Commentary: ${aiText}`);
      }
    } catch (err) {
      console.error(`AI commentary failed for play ${playId}:`, err.message);
    }
  }
}

/**
 * Check if the match already has any commentary plays recorded in the database.
 */
async function hasCommentaries(matchId) {
  const [record] = await db
    .select({ id: commentary.id })
    .from(commentary)
    .where(eq(commentary.matchId, matchId))
    .limit(1);
  return !!record;
}

/**
 * Core loop to fetch scoreboards, update matches, and parse summaries for active live events.
 */
async function processEvents() {
  try {
    const rawEvents = await fetchLiveEvents();
    if (rawEvents.length === 0) {
      console.log("ℹ️ No active matches returned from scoreboard.");
      return;
    }

    let liveCount = 0;
    
    for (const ev of rawEvents) {
      // We prioritize processing live matches to not overload the API
      if (ev.status !== "live" && ev.status !== "scheduled") continue;
      
      if (ev.status === "live") liveCount++;

      // 1. Upsert match record (saves/updates general details and overall scores)
      const match = await upsertMatch(ev);
      if (!match) continue;

      // 2. Update scores via local REST API (which automatically broadcasts to all WS clients!)
      try {
        await axios.patch(`${API_URL}/matches/${match.id}/score`, {
          homeScore: match.homeScore,
          awayScore: match.awayScore,
        });
      } catch (err) {
        console.error(`Failed to update scores for match ${match.id} via API:`, err.response?.data || err.message);
      }

      // 3. Fetch play-by-play summaries ONLY if live
      if (match.status === "live") {
        const summary = await fetchGameSummary(ev._rawId); // Use the raw string ID for details
        const plays = summary.plays || [];
        
        // Reverse plays to process oldest to newest
        const chronologicalPlays = [...plays].reverse();
        for (const play of chronologicalPlays) {
          await processPlay(play, match);
        }
      }
      // Add a 400ms delay to strictly respect the 3 req/s sportdb API rate limit
      await new Promise(r => setTimeout(r, 400));
    }
    console.log(`✅ Processed ${rawEvents.length} matches (${liveCount} currently LIVE)`);
  } catch (err) {
    console.error("Live worker error:", err.message);
  }
}

// Poll every 5 seconds to give near-instant Cricbuzz-like updates
const POLL_INTERVAL_MS = Number.parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);
setInterval(processEvents, POLL_INTERVAL_MS);

// Run immediately on start
processEvents();

console.log(`🟢 LiveMatchWorker with SportDB Flashscore API integration started – polling every ${POLL_INTERVAL_MS} ms`);
