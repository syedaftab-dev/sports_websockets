import { WebSocket, WebSocketServer } from "ws"
import { wsArcjet } from "../arcjet.js";
import { codec } from "zod";

// a helper function to check client is open and stringify raw data
function sendJson(socket, payload){
    if(socket.readyState !== WebSocket.OPEN){
        return
    }

    socket.send(JSON.stringify(payload))
}

// broadcast
function broadCast(wss, payload){
    for(const client of wss.clients){
        if(client.readyState !== WebSocket.OPEN){
            continue;
        }
        client.send(JSON.stringify(payload))
    }
}

export function attachWebSocketServer(server){
    const wss = new WebSocketServer({
        server, // same server as express to use save server
        // api or endpoint, only for hitted by websockets others will be handled by express  
        path: '/ws',
        maxPayload: 1024*1024 // max size of incoming payload == 1MB
    })
    
     wss.on('connection',async (socket, req)=>{

        // ws arcjet protection to make only 1 websockt tunnel, prevent from more request for handshaking
        if(wsArcjet){
            try {
                const decision = await wsArcjet.protect(socket);

                if(decision.isDenied()){
                    const code = decision.reason.isRateLimit() ? 1013 : 1008;
                    // 1013 rate limited and 1008-> bot detected
                    const reason = decision.reason.isRateLimit() ? 'Rate limited exceeded' : 'Access denied';

                    socket.close(code,reason);
                    return;
                }

            } catch (error) {
                console.error('ws connection error',error);
                socket.close(1011,'Server security error'); // 1011 -> general error
                return;
            }
        }


        socket.isAlive = true;
        socket.on('pong',()=>{ socket.isAlive = true })
        
        sendJson(socket, {type : 'welcome'});

        socket.on('error', console.error)
        })
        const interval = setInterval(()=>{
            wss.clients.forEach((ws)=>{
                if(ws.isAlive === false)return ws.terminate();
                ws.isAlive = false;
                ws.ping();
            })
        },3000);

        wss.on('close',()=> clearInterval(interval))
        // clean up function or broadcast to everyone
        function broadcastMatchCreated(match){
            broadCast(wss, {type: "match_created", data: match })
        }

        return { broadcastMatchCreated }
}