// src/services/sportsApi.js
import axios from 'axios';

// Utility to convert Flashscore string IDs to integers for our DB schema
export function hashId(str) {
  if (!str) return Math.floor(Math.random() * 1000000);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Fetch live and scheduled matches from sportdb (Flashscore) API.
 */
export async function fetchLiveEvents() {
  const apiKey = process.env.API_SPORTS_KEY;
  if (!apiKey) {
    console.error("API_SPORTS_KEY is missing!");
    return [];
  }

  try {
    const response = await axios.get('https://api.sportdb.dev/api/flashscore/cricket/live', {
      headers: { 'X-API-Key': apiKey }
    });

    const matches = response.data;
    if (!Array.isArray(matches)) {
        console.error("Invalid response from sportdb live matches endpoint");
        return [];
    }

    return matches.map(match => {
      // Map eventStage to our enum: scheduled, live, finished
      let status = 'scheduled';
      const stage = match.eventStage?.toUpperCase();
      if (stage === 'LIVE' || match.eventStageTypeFromEventStageId === '2' || match.gameTime !== "-1" && match.gameTime !== "") {
          status = 'live';
      } else if (stage === 'FINISHED' || match.eventStageTypeFromEventStageId === '3') {
          status = 'finished';
      }

      const startTime = new Date(match.startDateTimeUtc || match.startTime * 1000);
      const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

      return {
        _rawId: match.eventId, // Keep the raw string ID for fetching details later
        id: hashId(match.eventId),
        sport: 'cricket',
        homeTeam: match.homeName || 'Home Team',
        awayTeam: match.awayName || 'Away Team',
        startTime,
        endTime,
        status,
        homeScore: parseInt(match.homeScore) || 0,
        awayScore: parseInt(match.awayScore) || 0,
      };
    });
  } catch (err) {
    console.error('Failed to fetch sportdb matches:', err.message);
    return [];
  }
}

/**
 * Fetch detailed events (commentary/incidents) for a specific match.
 */
export async function fetchGameSummary(rawId) {
  const apiKey = process.env.API_SPORTS_KEY;
  try {
    const detailsUrl = `https://api.sportdb.dev/api/flashscore/match/${rawId}/details`;
    const response = await axios.get(detailsUrl, {
      headers: { 'X-API-Key': apiKey }
    });

    const events = response.data.events || [];
    
    // Convert flashscore events into our expected plays format
    const plays = events.map((event, index) => {
        let typeName = Array.isArray(event.incidentTypeName) ? event.incidentTypeName.join(' / ') : (event.incidentTypeName || 'Event');
        if (event.incidentSubtypeName) {
            typeName += ` (${event.incidentSubtypeName})`;
        }
        
        let playerName = Array.isArray(event.incidentPlayerName) ? event.incidentPlayerName.join(', ') : (event.incidentPlayerName || '');
        
        const message = playerName ? `${playerName} - ${typeName}` : typeName;
        const minute = parseInt(event.incidentTime?.replace("'", "")) || 0;

        return {
            id: event.eventId || `evt-${index}`,
            sequenceNumber: index + 1,
            text: message,
            type: { text: typeName },
            clock: { displayValue: event.incidentTime },
            period: { number: parseInt(event.incidentHalf) || 1, displayValue: `${event.incidentHalf} Half` },
            scoringPlay: typeName.toLowerCase().includes('goal')
        };
    });

    return { plays };
  } catch (err) {
    console.error(`Failed to fetch summary for ${rawId}:`, err.message);
    return { plays: [] };
  }
}
