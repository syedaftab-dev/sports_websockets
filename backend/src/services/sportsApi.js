// src/services/sportsApi.js
import axios from 'axios';

// Map ESPN leagues
export const SPORTS_CONFIG = [
  { sport: 'basketball', league: 'nba', label: 'NBA' },
  { sport: 'soccer', league: 'usa.1', label: 'MLS' },
  { sport: 'soccer', league: 'eng.1', label: 'Premier League' },
  { sport: 'soccer', league: 'esp.1', leagueLabel: 'La Liga' },
  { sport: 'baseball', league: 'mlb', label: 'MLB' }
];

export function hashId(str) {
  if (!str) return Math.floor(Math.random() * 1000000);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return (Math.abs(hash) % 2147483640) + 1; // Fit in PG integer range
}

/**
 * Fetch all matches from all configured ESPN leagues.
 */
export async function fetchLiveEvents() {
  const allEvents = [];

  for (const { sport, league } of SPORTS_CONFIG) {
    try {
      const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?limit=15`;
      const response = await axios.get(url, { timeout: 8000 });
      const events = response.data?.events || [];

      for (const event of events) {
        const competition = event.competitions?.[0] || {};
        const competitors = competition.competitors || [];
        const homeCompetitor = competitors.find(c => c.homeAway === 'home') || {};
        const awayCompetitor = competitors.find(c => c.homeAway === 'away') || {};

        const homeTeam = homeCompetitor.team?.displayName || 'Home';
        const awayTeam = awayCompetitor.team?.displayName || 'Away';
        const homeScore = homeCompetitor.score || '0';
        const awayScore = awayCompetitor.score || '0';
        const startTime = new Date(event.date || competition.date || Date.now());
        const endTime = new Date(startTime.getTime() + 3 * 60 * 60 * 1000); // 3 hours duration

        const state = event.status?.type?.state; // 'pre', 'in', 'post'
        let status = 'scheduled';
        if (state === 'in') {
          status = 'live';
        } else if (state === 'post') {
          status = 'finished';
        }

        const rawId = `${sport}:${league}:${event.id}`;

        allEvents.push({
          _rawId: rawId,
          id: hashId(rawId),
          sport,
          homeTeam,
          awayTeam,
          startTime,
          endTime,
          status,
          homeScore,
          awayScore
        });
      }
    } catch (err) {
      console.error(`[ESPN API] Failed to fetch ${sport}/${league}:`, err.message);
    }
  }

  return allEvents;
}

/**
 * Fetch detailed commentary/plays for a specific match from ESPN summary endpoint.
 */
export async function fetchGameSummary(rawId) {
  if (!rawId || !rawId.includes(':')) {
    return { plays: [] };
  }

  const parts = rawId.split(':');
  if (parts.length !== 3) {
    return { plays: [] };
  }

  const [sport, league, eventId] = parts;

  try {
    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/summary?event=${eventId}`;
    const response = await axios.get(summaryUrl, { timeout: 8000 });
    const rawPlays = response.data?.plays || [];

    // Map ESPN plays to our unified commentary format
    const plays = rawPlays.map((play, index) => {
      const typeName = play.type?.text || 'Play';
      const periodLabel = play.period?.displayValue || `${play.period?.number || 1} Period`;
      const clockDisplay = play.clock?.displayValue || '';

      return {
        id: play.id || `play-${eventId}-${index}`,
        sequenceNumber: Number(play.sequenceNumber) || (index + 1),
        text: play.text || '',
        type: { text: typeName },
        clock: { displayValue: clockDisplay },
        period: { number: play.period?.number || 1, displayValue: periodLabel },
        scoringPlay: !!play.scoringPlay,
        homeScore: String(play.homeScore ?? '0'),
        awayScore: String(play.awayScore ?? '0')
      };
    });

    return { plays };
  } catch (err) {
    console.error(`[ESPN API] Failed to fetch summary for ${rawId}:`, err.message);
    return { plays: [] };
  }
}
