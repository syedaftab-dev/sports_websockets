import { WebSocket, WebSocketServer } from "ws"
import { wsArcjet } from "../arcjet.js";
import { codec } from "zod";

// map for diecty messages of particular sport to particular audience only ,not to all audience

const matchSubscribers = new Map();

function subscribe(matchId,socket){
    if(!matchSubscribers.has(matchId)){
        matchSubscribers.set(matchId,new Set());
    }

    matchSubscribers.get(matchId).add(socket);
}

function unsubscribe(matchId,socket){
    // get all subscriber
    const sub = matchSubscribers.get(matchId);
    // if no subscri
    if(!sub){
        return
    }
    sub.delete(socket);
    // if no subscribers after unsubscribe
    if(sub.size === 0){
        matchSubscribers.delete(matchId);
    }
}

// if a user is off or exited / no internet, we just remove him from subscribtion
function cleanUpSubscriptions(socket){
    for(const matchId of socket.subscriptions){
        unsubscribe(matchId,socket);
    }
}

// function to send data only to subscribed people to a particular matches

function broadcastToMatch(matchId, payload){
    const subscribers = matchSubscribers.get(matchId);
    if(!subscribers || subscribers.size===0)return;

    const message = JSON.stringify(payload);

    for(const client of subscribers){
        if(client.readyState === WebSocket.OPEN){
            client.send(message);
        }
    }
}

// functoin to handle message formatting
function handleMessage(socket,data){
    let message;
    try{
        message = JSON.parse(data.toString());
    }catch{
        sendJson(socket, {type : 'error', message: 'Invalid JSON'})
    }

    if (message?.type === 'subscribe' && Number.isInteger(message.matchId)) {
        subscribe(message.matchId, socket);
        socket.subscriptions.add(message.matchId);
        sendJson(socket, { type: 'subscribed', matchId: message.matchId });
    }

    if (message?.type === 'unsubscribe' && Number.isInteger(message.matchId)) {
        unsubscribe(message.matchId, socket);
        socket.subscriptions.delete(message.matchId);
        sendJson(socket, { type: 'unsubscribed', matchId: message.matchId });
    }
}


// a helper function to check client is open and stringify raw data
function sendJson(socket, payload) {
    if (socket.readyState !== WebSocket.OPEN) {
        return
    }

    socket.send(JSON.stringify(payload))
}

// broadcast
function broadCastToAll(wss, payload) {
    for (const client of wss.clients) {
        if (client.readyState !== WebSocket.OPEN) {
            continue;
        }
        client.send(JSON.stringify(payload))
    }
}

export function attachWebSocketServer(server) {
    const wss = new WebSocketServer({
        server, // same server as express to use save server
        // api or endpoint, only for hitted by websockets others will be handled by express  
        path: '/ws',
        maxPayload: 1024 * 1024 // max size of incoming payload == 1MB
    })

// Removed custom upgrade handler. WebSocketServer is initialized with the HTTP server and path, so ws library automatically handles upgrades.

    wss.on('connection', async (socket, req) => {
        socket.isAlive = true;
        socket.on('pong', () => { socket.isAlive = true })

        socket.subscriptions = new Set();

        sendJson(socket, { type: 'welcome' });
        socket.on('message',(data)=>{
            handleMessage(socket,data);
        })
        socket.on('error',()=>{
            socket.terminate()
            })
        socket.on('close',()=>{
            cleanUpSubscriptions(socket);
        })
        socket.on('error', console.error)
    })
    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping();
        })
    }, 3000);

    wss.on('close', () => clearInterval(interval))
    // clean up function or broadcast to everyone
    function broadcastMatchCreated(match) {
        broadCastToAll(wss, { type: "match_created", data: match })
    }
    function broadcastCommentary(matchId,comment){
        broadcastToMatch(matchId,{ type: 'commentary', data:comment });
    }
    return { broadcastMatchCreated,broadcastCommentary }
}