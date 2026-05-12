import { WebSocket, WebSocketServer } from "ws"

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
    
     wss.on('connection',(socket)=>{
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