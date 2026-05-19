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

// Simulated Cricket Match State for Fallback
const SIMULATED_MATCHES = [
  {
    id: 182712573,
    _rawId: "sim-ipl-1",
    sport: "cricket",
    homeTeam: "Rajasthan Royals",
    awayTeam: "Lucknow Super Giants",
    startTime: new Date(),
    endTime: new Date(Date.now() + 3 * 3600 * 1000),
    status: "live",
    homeScore: "120/3 (14.0 ov)", 
    awayScore: "Yet to bat",
    homeRuns: 120,
    awayRuns: 0,
    wickets: 3,
    overs: 14.0,
    ballsBowled: 84
  },
  {
    id: 564614941,
    _rawId: "sim-ban-pak",
    sport: "cricket",
    homeTeam: "Bangladesh",
    awayTeam: "Pakistan",
    startTime: new Date(),
    endTime: new Date(Date.now() + 3 * 3600 * 1000),
    status: "live",
    homeScore: "245/8 (45.2 ov)",
    awayScore: "210/10 (41.0 ov)",
    homeRuns: 245,
    awayRuns: 210,
    wickets: 8,
    overs: 45.2,
    ballsBowled: 272
  }
];

// Helper to generate a simulated cricket play
function generateSimulatedPlay(match) {
  const bowlers = ["Yuzvendra Chahal", "Ravichandran Ashwin", "Trent Boult", "Avesh Khan", "Krunal Pandya", "Ravi Bishnoi"];
  const batsmen = ["Sanju Samson", "Yashasvi Jaiswal", "Jos Buttler", "KL Rahul", "Nicholas Pooran", "Quinton de Kock"];
  
  const bowler = bowlers[Math.floor(Math.random() * bowlers.length)];
  const batsman = batsmen[Math.floor(Math.random() * batsmen.length)];
  
  // Calculate next ball/over
  match.ballsBowled += 1;
  const overNumber = Math.floor(match.ballsBowled / 6);
  const ballNumber = match.ballsBowled % 6;
  const overDisplay = `${overNumber}.${ballNumber}`;
  match.overs = parseFloat(overDisplay);

  const events = [
    { type: "Dot ball", run: 0, msg: `${bowler} to ${batsman}, no run. Defensive stroke.` },
    { type: "Single", run: 1, msg: `${bowler} to ${batsman}, 1 run. Guided down to third man.` },
    { type: "Two runs", run: 2, msg: `${bowler} to ${batsman}, 2 runs. Flicked away to deep midwicket.` },
    { type: "FOUR", run: 4, msg: `${bowler} to ${batsman}, FOUR! Beautiful cover drive piercing the infield!` },
    { type: "SIX", run: 6, msg: `${bowler} to ${batsman}, SIX! Lofted clean over long-on! Massive hit!` },
    { type: "Wicket", run: 0, wicket: true, msg: `${bowler} to ${batsman}, OUT! Clean bowled! The stump is cartwheeling!` }
  ];

  // Higher probability of dots and singles
  const weights = [0.3, 0.4, 0.15, 0.08, 0.04, 0.03];
  let r = Math.random();
  let index = 0;
  while (r > 0) {
    r -= weights[index];
    if (r <= 0) break;
    index++;
  }
  
  const event = events[index] || events[0];
  
  match.homeRuns += event.run;
  if (event.wicket) {
    match.wickets = (match.wickets || 0) + 1;
    if (match.wickets >= 10) {
       match.wickets = 0;
       match.homeRuns = 0;
       match.ballsBowled = 0;
    }
  }

  // Set the clean scoreboard format
  match.homeScore = `${match.homeRuns}/${match.wickets} (${overDisplay} ov)`;

  return {
    id: `sim-play-${Date.now()}`,
    sequenceNumber: match.ballsBowled,
    text: `[Overs ${overDisplay}] ${event.msg} (Score: ${match.homeScore})`,
    type: { text: event.type },
    clock: { displayValue: `${overDisplay} ov` },
    period: { number: 1, displayValue: "1st Innings" },
    scoringPlay: event.run > 3 || event.wicket
  };
}

/**
 * Core loop to fetch scoreboards, update matches, and parse summaries for active live events.
 */
async function processEvents() {
  try {
    let rawEvents = [];
    let isMockMode = false;

    try {
      rawEvents = await fetchLiveEvents();
    } catch (e) {
      console.log("⚠️ API returned error, falling back to Simulation mode.");
    }

    // Fallback: If no matches are live (scheduled matches only, or API payment/rate limits hit)
    if (rawEvents.length === 0 || rawEvents.every(m => m.status !== "live")) {
      console.log("ℹ️ No active live matches on the scoreboard or API limit reached. Activating Simulation fallback...");
      rawEvents = SIMULATED_MATCHES;
      isMockMode = true;
    }

    let liveCount = 0;
    
    for (const ev of rawEvents) {
      if (ev.status !== "live" && ev.status !== "scheduled") continue;
      
      if (ev.status === "live") liveCount++;

      // 1. Upsert match record
      const match = await upsertMatch(ev);
      if (!match) continue;

      // 2. Update scores via local REST API
      try {
        await axios.patch(`${API_URL}/matches/${match.id}/score`, {
          homeScore: ev.homeScore,
          awayScore: ev.awayScore,
        });
      } catch (err) {
        console.error(`Failed to update scores for match ${match.id} via API:`, err.response?.data || err.message);
      }

      // 3. Fetch or Simulate play-by-play summaries ONLY if live
      if (match.status === "live") {
        let plays = [];
        if (isMockMode) {
          // Generate a simulated ball event
          const play = generateSimulatedPlay(ev);
          plays = [play];
        } else {
          const summary = await fetchGameSummary(ev._rawId);
          plays = summary.plays || [];
        }
        
        // Process plays
        const chronologicalPlays = [...plays].reverse();
        for (const play of chronologicalPlays) {
          await processPlay(play, match);
        }
      }
      
      // Add a 400ms delay to strictly respect the 3 req/s sportdb API rate limit
      await new Promise(r => setTimeout(r, 400));
    }
    console.log(`✅ Processed ${rawEvents.length} matches (${liveCount} currently LIVE) [Simulation Fallback: ${isMockMode}]`);
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
