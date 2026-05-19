import {WebSocket, WebSocketServer} from 'ws';
import {wsArcjet} from "../arcjet.js";
import { redisSubscriber } from '../utils/redisClient.js';

const matchSubscribers = new Map();

function subscribe(matchId, socket) {
    if(!matchSubscribers.has(matchId)) {
        matchSubscribers.set(matchId, new Set());
    }
    matchSubscribers.get(matchId).add(socket);
}

function unsubscribe(matchId, socket) {
    const subscribers = matchSubscribers.get(matchId);
    if(!subscribers) return;
    subscribers.delete(socket);
    if(subscribers.size === 0) {
        matchSubscribers.delete(matchId);
    }
}

function cleanupSubscriptions(socket) {
    for(const matchId of socket.subscriptions) {
        unsubscribe(matchId, socket);
    }
}

function sendJson(socket, payload) {
    if(socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(payload));
}

function broadcastToAll(wss, payload) {
    for (const client of wss.clients)  {
        if(client.readyState !== WebSocket.OPEN) continue;
        client.send(JSON.stringify(payload));
    }
}

function broadcastToMatch(matchId, payload) {
    const subscribers = matchSubscribers.get(Number(matchId));
    if(!subscribers || subscribers.size === 0) {
        console.log(`[WS] No subscribers for match ${matchId}`);
        return;
    }
    const message = JSON.stringify(payload);
    console.log(`[WS] Broadcasting to ${subscribers.size} subscribers for match ${matchId}:`, message);
    for(const client of subscribers) {
        if(client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
}

function handleMessage(socket, data) {
    let message;
    try {
        message = JSON.parse(data.toString());
    } catch {
        sendJson(socket, { type: 'error', message: 'Invalid JSON' });
    }
    const subscribeMatchId = Number(message?.matchId);
    if(message?.type === "subscribe" && Number.isInteger(subscribeMatchId)) {
        console.log(`[WS] Client subscribing to match ${subscribeMatchId}`);
        subscribe(subscribeMatchId, socket);
        socket.subscriptions.add(subscribeMatchId);
        sendJson(socket, { type: 'subscribed', matchId: subscribeMatchId });
        return;
    } else if (message?.type === "subscribe") {
        console.log(`[WS] Client attempted to subscribe with invalid matchId type:`, typeof message.matchId, message.matchId);
        return;
    }
    const unsubscribeMatchId = Number(message?.matchId);
    if(message?.type === "unsubscribe" && Number.isInteger(unsubscribeMatchId)) {
        unsubscribe(unsubscribeMatchId, socket);
        socket.subscriptions.delete(unsubscribeMatchId);
        sendJson(socket, { type: 'unsubscribed', matchId: unsubscribeMatchId });
    }
    if(message?.type === "setSubscriptions" && Array.isArray(message.matchIds)) {
        for (const id of message.matchIds) {
            const matchId = Number(id);
            if (Number.isInteger(matchId)) {
                if (!socket.subscriptions.has(matchId)) {
                    subscribe(matchId, socket);
                    socket.subscriptions.add(matchId);
                }
            }
        }
        sendJson(socket, { type: 'subscriptions', matchIds: Array.from(socket.subscriptions) });
    }
}

export function attachWebSocketServer(server) {
    const wss = new WebSocketServer({ noServer: true, path: '/ws', maxPayload: 1024 * 1024 });

    server.on('upgrade', async (req, socket, head) => {
        const { pathname } = new URL(req.url, `http://${req.headers.host}`);
        if (pathname !== '/ws') {
            return;
        }
        if (wsArcjet) {
            try {
                const decision = await wsArcjet.protect(req);
                if (decision.isDenied()) {
                    if (decision.reason.isRateLimit()) {
                        socket.write('HTTP/1.1 429 Too Many Requests\\r\\n\\r\\n');
                    } else {
                        socket.write('HTTP/1.1 403 Forbidden\\r\\n\\r\\n');
                    }
                    socket.destroy();
                    return;
                }
            } catch (e) {
                console.error('WS upgrade protection error', e);
                socket.write('HTTP/1.1 500 Internal Server Error\\r\\n\\r\\n');
                socket.destroy();
                return;
            }
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });

    wss.on('connection', async (socket, req) => {
        socket.isAlive = true;
        socket.on('pong', () => { socket.isAlive = true; });
        socket.subscriptions = new Set();
        sendJson(socket, { type: 'welcome' });
        socket.on('message', (data) => { handleMessage(socket, data); });
        socket.on('error', () => { socket.terminate(); });
        socket.on('close', () => { cleanupSubscriptions(socket); });
        socket.on('error', console.error);
    });

    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        })}, 30000);

    wss.on('close', () => clearInterval(interval));

    // Redis subscription handling
    redisSubscriber.on('pmessage', (pattern, channel, message) => {
        try {
            const data = JSON.parse(message);
            const [, matchId] = channel.split(':');
            const numericMatchId = Number(matchId);
            if (pattern === 'match:*') {
                broadcastToAll(wss, {
                    type: 'score_update',
                    matchId: numericMatchId,
                    data: {
                        homeScore: data.homeScore,
                        awayScore: data.awayScore
                    }
                });
            } else if (pattern === 'commentary:*') {
                broadcastToMatch(numericMatchId, {
                    type: 'commentary',
                    data: data
                });
            }
        } catch (e) {
            console.error('Redis message handling error:', e);
        }
    });

    // Subscribe to all match and commentary channels (wildcard)
    redisSubscriber.psubscribe('match:*');
    redisSubscriber.psubscribe('commentary:*');

    function broadcastMatchCreated(match) {
        broadcastToAll(wss, { type: 'match_created', data: match });
    }

    function broadcastCommentary(matchId, comment) {
        broadcastToMatch(matchId, { type: 'commentary', data: comment });
    }

    function broadcastScoreUpdate(matchId, payload) {
        broadcastToAll(wss, { type: 'score_update', matchId, data: payload });
    }

    return { broadcastMatchCreated, broadcastCommentary, broadcastScoreUpdate };
}


