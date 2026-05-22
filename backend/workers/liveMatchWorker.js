// workers/liveMatchWorker.js
import "dotenv/config";
import axios from "axios";
import { fetchLiveEvents, fetchGameSummary } from "../src/services/sportsApi.js";
import { db } from "../src/db/db.js";
import { matches, commentary } from "../src/db/schema.js";
import { eq, and, desc } from "drizzle-orm";
import { generateCommentary } from "../services/aiCommentaryService.js";

const PORT = process.env.PORT || 8000;
const API_URL = process.env.API_URL || `http://127.0.0.1:${PORT}`;

// Cache for processed play IDs to prevent duplicates
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

// Map to track states of simulated matches
const simulationStates = new Map();

// Map to track last activity timestamps for ambient comment generation
const lastActivityTimestamps = new Map();
let activeLiveMatchesList = [];

// Helper to sort plays chronologically by sequence number
function sortPlaysChronologically(plays) {
  if (!plays) return [];
  return [...plays].sort((a, b) => {
    const seqA = Number(a.sequenceNumber) || 0;
    const seqB = Number(b.sequenceNumber) || 0;
    return seqA - seqB;
  });
}

// Helper generators for fallback mock plays based on sport
function generateSportPlay(match, index) {
  const sport = (match.sport || 'soccer').toLowerCase();

  if (sport === 'basketball') {
    const plays = [
      "Jump ball to start the match!",
      "Driving layup made! 2 points.",
      "Shooting foul called. Two free throws.",
      "Free throw made! 1 point.",
      "Three-pointer missed from the corner.",
      "Steal! Fast break underway.",
      "DUNK! Massive slam dunk in transition!",
      "Defensive rebound secured.",
      "Shot clock violation! Turn over.",
      "Timeout called by the head coach."
    ];
    const msg = plays[index % plays.length];
    const isScore = msg.includes("made!") || msg.includes("layup") || msg.includes("DUNK!");

    return {
      id: `sim-hoops-${match.id}-${index}`,
      sequenceNumber: index + 1,
      text: msg,
      type: { text: isScore ? "Score" : "Play" },
      clock: { displayValue: `${12 - (index % 12)}:00` },
      period: { number: Math.floor(index / 10) + 1, displayValue: `Quarter ${Math.floor(index / 10) + 1}` },
      scoringPlay: isScore,
      points: msg.includes("Three-pointer") ? 3 : msg.includes("Free throw") ? 1 : 2
    };
  } else if (sport === 'baseball') {
    const plays = [
      "Play ball! The pitcher gets ready.",
      "Strike one! Sharp fastball on the corner.",
      "Ball one. High and outside.",
      "Foul ball into the stands.",
      "Strikes out swinging! First out of the inning.",
      "Single to shallow right field. Runner on first.",
      "Fly out to center field. Two outs.",
      "Walked! Runner advances to second.",
      "HOME RUN! That ball is out of here! A massive blast over the wall!",
      "Ground out to short-stop. Inning ends."
    ];
    const msg = plays[index % plays.length];
    const isHR = msg.includes("HOME RUN!");

    return {
      id: `sim-baseball-${match.id}-${index}`,
      sequenceNumber: index + 1,
      text: msg,
      type: { text: isHR ? "Home Run" : "Play" },
      clock: { displayValue: `Inning ${Math.floor(index / 3) + 1}` },
      period: { number: Math.floor(index / 3) + 1, displayValue: `${Math.floor(index / 3) + 1} Inning` },
      scoringPlay: isHR,
      runs: isHR ? 2 : 0
    };
  } else {
    // Soccer
    const plays = [
      "Match kicked off! Intense start from both teams.",
      "Throw-in near the corner flag.",
      "Free kick awarded after a sliding tackle.",
      "Spectacular save by the goalkeeper!",
      "Yellow card issued for a late challenge.",
      "Shot wide of the post.",
      "Corner kick floated into the box, headed away.",
      "GOAL! What an amazing strike into the top corner!",
      "Offside flag is up.",
      "Substitution: Fresh legs coming on to replace a tired midfielder."
    ];
    const msg = plays[index % plays.length];
    const isGoal = msg.includes("GOAL!");

    return {
      id: `sim-soccer-${match.id}-${index}`,
      sequenceNumber: index + 1,
      text: msg,
      type: { text: isGoal ? "Goal" : "Play" },
      clock: { displayValue: `${Math.min(90, Math.floor(index * 2.5 + 1))}'` },
      period: { number: index > 18 ? 2 : 1, displayValue: index > 18 ? "2nd Half" : "1st Half" },
      scoringPlay: isGoal,
      goals: isGoal ? 1 : 0
    };
  }
}

/**
 * Upsert match details.
 * When skipScores=true, we only upsert metadata (status, teams, times) but
 * NOT scores. Scores are updated exclusively via the PATCH /score endpoint
 * to avoid the scoreboard's final score overwriting the simulated running score.
 */
async function upsertMatch(ev, { skipScores = false } = {}) {
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
    homeScore: skipScores ? '0' : String(homeScore),
    awayScore: skipScores ? '0' : String(awayScore),
  };

  const updateData = {
    status,
    endTime: new Date(endTime),
  };
  if (!skipScores) {
    updateData.homeScore = String(homeScore);
    updateData.awayScore = String(awayScore);
  }

  try {
    const [record] = await db
      .insert(matches)
      .values(matchData)
      .returning();
    console.log(`🆕 Registered match: ${homeTeam} vs ${awayTeam} (ID: ${id})`);
    return record;
  } catch (e) {
    const [updated] = await db
      .update(matches)
      .set(updateData)
      .where(eq(matches.id, id))
      .returning();
    return updated;
  }
}

/**
 * Processes a single play/event from a game.
 */
async function processPlay(play, match) {
  const playId = play.id || `${match.id}-${play.sequenceNumber}`;
  if (isPlayProcessed(playId)) {
    return;
  }
  markPlayProcessed(playId);
  lastActivityTimestamps.set(match.id, Date.now());

  const minute = play.clock?.displayValue ? parseInt(play.clock.displayValue.match(/\d+/)?.[0] || '0', 10) : (play.minute || 0);
  const sequence = parseInt(play.sequenceNumber, 10) || 0;
  const period = play.period?.displayValue || "";
  const eventType = play.type?.text || "Play";
  const message = play.text || "";

  // Check db duplicates
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
    console.log(`📣 [Match ${match.id} - ${match.sport.toUpperCase()}] Play: ${message}`);
  } catch (err) {
    console.error(`Failed to submit commentary play ${playId} via API:`, err.response?.data || err.message);
  }

  // 2. Trigger AI Commentary for important events
  const isImportant = play.scoringPlay === true ||
    /goal|three point|dunk|touchdown|home run|wicket/i.test(eventType || "") ||
    /goal|3-pt|three pointer|dunk|home run/i.test(message);

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
          sequence: sequence + 1,
          period,
          eventType: "AI Commentary",
          message: `🤖 ${aiText}`,
        });
        console.log(`🤖 [Match ${match.id}] AI Commentary: ${aiText}`);
      }
    } catch (err) {
      console.error(`AI commentary failed for play ${playId}:`, err.message);
    }
  }
}

/**
 * Core loop to fetch scoreboards, update matches, and parse summaries for active live events.
 */
async function processEvents() {
  try {
    let rawEvents = await fetchLiveEvents();
    if (rawEvents.length === 0) {
      console.log("ℹ️ No matches found on ESPN scoreboards.");
      return;
    }

    // Identify if we have any active live matches
    let liveMatches = rawEvents.filter(m => m.status === 'live').map(m => ({ ...m, isSimulated: false }));

    // DEV FALLBACK: If no matches are live, promote the first 3 matches to 'live' and simulate them!
    const isMockFallback = liveMatches.length === 0;
    if (isMockFallback) {
      console.log("ℹ️ No active live matches. Activating Simulation mode for scheduled/finished games...");
      // Select first 3 matches, but filter out those that are already marked as finished in the DB
      const candidates = rawEvents.slice(0, 3);
      const filteredLiveMatches = [];
      for (const m of candidates) {
        const [existing] = await db.select({ status: matches.status }).from(matches).where(eq(matches.id, m.id)).limit(1);
        if (existing && existing.status === 'finished') {
          continue;
        }
        filteredLiveMatches.push({ ...m, status: 'live', isSimulated: true });
      }
      liveMatches = filteredLiveMatches;
    }

    // Set header bypass for worker requests
    axios.defaults.headers.common['x-trusted-worker'] = 'true';

    for (const ev of liveMatches) {
      if (!ev.isSimulated) {
        // Real Live Match - immediately upsert and process all existing plays
        const match = await upsertMatch(ev);
        if (!match) continue;

        // Post score updates from scoreboard
        try {
          await axios.patch(`${API_URL}/matches/${match.id}/score`, {
            homeScore: ev.homeScore,
            awayScore: ev.awayScore,
          });
        } catch (err) {
          console.error(`Failed to update scores for match ${match.id}:`, err.message);
        }

        console.log(`[Worker] Real Live Match ${ev.homeTeam} vs ${ev.awayTeam}: Fetching latest play log...`);
        const summary = await fetchGameSummary(ev._rawId);
        let plays = summary.plays || [];

        // Chronological order (oldest to newest)
        plays = sortPlaysChronologically(plays);

        console.log(`[Worker] Processing ${plays.length} real live plays immediately...`);
        for (const play of plays) {
          await processPlay(play, match);
        }
      } else {
        // Simulated Match - Stream play-by-play (1 play per tick)
        if (!simulationStates.has(ev.id)) {
          console.log(`[Worker] Initializing play-by-play simulation cache for ${ev.homeTeam} vs ${ev.awayTeam} (ID: ${ev.id})...`);
          const summary = await fetchGameSummary(ev._rawId);

          let plays = summary.plays || [];
          const hasESPNScores = plays.length > 0 && plays.some(p => p.homeScore !== undefined);
          if (plays.length === 0) {
            console.log(`[Worker] Match ${ev.id} has no ESPN play log. Creating mock events.`);
            plays = Array.from({ length: 50 }, (_, i) => generateSportPlay(ev, i));
          } else {
            plays = sortPlaysChronologically(plays);
          }

          simulationStates.set(ev.id, {
            currentPlayIndex: 0,
            plays,
            homeScore: 0,
            awayScore: 0,
            hasESPNScores, // ESPN plays carry running totals; mock plays need manual tracking
          });
        }

        const state = simulationStates.get(ev.id);

        if (state.currentPlayIndex < state.plays.length) {
          const currentPlay = state.plays[state.currentPlayIndex];

          // ── Determine the score for this tick ──
          if (currentPlay.homeScore !== undefined && currentPlay.awayScore !== undefined) {
            // ESPN play with running total — use it directly AND sync state
            state.homeScore = Number(currentPlay.homeScore);
            state.awayScore = Number(currentPlay.awayScore);
          } else if (!state.hasESPNScores) {
            // Mock plays without running totals — manually increment on scoring plays
            if (currentPlay.scoringPlay) {
              const isHomeScoring = Math.random() > 0.5;
              if (isHomeScoring) {
                state.homeScore += currentPlay.points || currentPlay.runs || currentPlay.goals || 1;
              } else {
                state.awayScore += currentPlay.points || currentPlay.runs || currentPlay.goals || 1;
              }
            }
          }
          // else: ESPN play without score on this particular event — keep state unchanged

          const tickHomeScore = String(state.homeScore);
          const tickAwayScore = String(state.awayScore);

          // Upsert match metadata (status/teams) but NOT scores — PATCH is the single source of truth
          const match = await upsertMatch(ev, { skipScores: true });
          if (!match) continue;

          // Post score updates — this is the ONLY place scores are written to DB & broadcast
          try {
            await axios.patch(`${API_URL}/matches/${match.id}/score`, {
              homeScore: tickHomeScore,
              awayScore: tickAwayScore,
            }, {
              headers: { 'x-trusted-worker': 'true' }
            });
          } catch (err) {
            console.error(`Failed to update scores for match ${match.id}:`, err.message);
          }

          // Process this play commentary
          await processPlay(currentPlay, match);

          // Advance to next play
          state.currentPlayIndex++;
        } else {
          // Simulation finished — use the tracked state scores (correct for both ESPN & mock)
          ev.status = 'finished';
          const finalHome = String(state.homeScore);
          const finalAway = String(state.awayScore);

          // Write final status + scores
          ev.homeScore = finalHome;
          ev.awayScore = finalAway;
          await upsertMatch(ev); // skipScores=false (default) — write final scores

          try {
            await axios.patch(`${API_URL}/matches/${ev.id}/score`, {
              homeScore: finalHome,
              awayScore: finalAway,
            }, {
              headers: { 'x-trusted-worker': 'true' }
            });
          } catch (err) {
            console.error(`Failed to patch final scores for match ${ev.id}:`, err.message);
          }

          console.log(`🏁 Match ${ev.homeTeam} vs ${ev.awayTeam} simulation complete. Final score: ${finalHome}-${finalAway}`);
          simulationStates.delete(ev.id);
        }
      }

      // Small delay between matches
      await new Promise(r => setTimeout(r, 500));
    }
    activeLiveMatchesList = liveMatches.map(m => ({ id: m.id, sport: m.sport }));
  } catch (err) {
    console.error("Live worker error:", err.message);
  }
}

// Initialize and clear tables before starting the worker
async function startWorker() {
  try {
    console.log("🧹 Clearing old match records from database...");
    await db.delete(commentary);
    await db.delete(matches);
    console.log("✅ Database cleared successfully!");
  } catch (err) {
    console.error("Failed to clear database on startup:", err.message);
  }

  // Run immediately on start
  await processEvents();
}

const AMBIENT_COMMENTS = {
  soccer: [
    "The referee is warning the players to keep it clean.",
    "The managers are actively shouting instructions from the technical areas.",
    "The crowd is singing and waving flags, creating a fantastic atmosphere.",
    "Possession is changing hands rapidly in the midfield.",
    "Players are taking a quick breather during a brief stoppage in play.",
    "Both teams are sizing each other up, looking for tactical openings."
  ],
  basketball: [
    "The coaching staff is discussing tactical adjustments on the bench.",
    "Defenders are playing tight, high-pressure man-to-man coverage.",
    "The home fans are on their feet, chanting 'Defense!' in unison.",
    "Substitute players are warming up near the scorer's table.",
    "The pace is electric as both teams trade quick possessions.",
    "Intense physical battles are happening inside the paint."
  ],
  baseball: [
    "The batter steps out of the box briefly to adjust his batting gloves.",
    "The manager is seen talking with the pitching coach in the dugout.",
    "The fans are doing the wave across the stadium stands.",
    "The infielders are shifting their positioning for the next hitter.",
    "A brief pause in play as the umpire inspects the ball.",
    "Warm-up pitches are being thrown in the bullpen."
  ],
  cricket: [
    "The captain is adjusting the field placements for the new batsman.",
    "The bowler is walking back to his run-up, planning the next delivery.",
    "The crowd is cheering every defensive block and push.",
    "The batsmen are having a quick chat in the middle of the pitch.",
    "The fielders are encouraging the bowler from all sides.",
    "Tactical discussions are underway as the drinks break approaches."
  ]
};

async function checkAndPushAmbientComments() {
  const now = Date.now();
  for (const m of activeLiveMatchesList) {
    const lastTime = lastActivityTimestamps.get(m.id) || now;
    // If it has been more than 12 seconds since last commentary/play activity
    if (now - lastTime > 12000) {
      // Find the match in the database to verify status
      const [match] = await db.select().from(matches).where(eq(matches.id, m.id)).limit(1);
      if (match && match.status === 'live') {
        const sport = (match.sport || 'soccer').toLowerCase();
        const comments = AMBIENT_COMMENTS[sport] || AMBIENT_COMMENTS.soccer;
        const randomComment = comments[Math.floor(Math.random() * comments.length)];

        // Find next sequence number
        const lastComms = await db
          .select({ sequence: commentary.sequence })
          .from(commentary)
          .where(eq(commentary.matchId, match.id))
          .orderBy(desc(commentary.sequence))
          .limit(1);
        const nextSeq = lastComms.length > 0 ? (lastComms[0].sequence + 1) : 1;

        try {
          await axios.post(`${API_URL}/matches/${match.id}/commentary`, {
            minute: null,
            sequence: nextSeq,
            period: "Live Talk",
            eventType: "Analyst Note",
            message: `🎙️ ${randomComment}`,
          });
          console.log(`🎙️ [Ambient Comment - Match ${match.id}] ${randomComment}`);
          // Update timestamp so we don't spam
          lastActivityTimestamps.set(match.id, now);
        } catch (err) {
          // Ignore
        }
      }
    }
  }
}

// Check and push ambient comments every 10 seconds
setInterval(checkAndPushAmbientComments, 10000);

// Poll every 25 seconds for a natural live sports pace
const POLL_INTERVAL_MS = 25000;
setInterval(processEvents, POLL_INTERVAL_MS);

startWorker();

console.log(`🟢 Unified Multi-Sport Live Worker running. Polling ESPN Scoreboard every ${POLL_INTERVAL_MS} ms.`);
