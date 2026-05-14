import 'dotenv/config';
import express from 'express';
import { matchRouter } from './routes/matches.js';
import http from 'http';
import { attachWebSocketServer } from './ws/server.js';
import { securityMiddleware } from './arcjet.js';
import { commentaryRouter } from './routes/commentary.js';

const PORT = Number(process.env.PORT || 8000);
const HOST = process.env.HOST || '0.0.0.0'
// Middleware to parse JSON bodies

const app = express();

const server = http.createServer(app);


app.use(express.json());

// Root GET route
app.get('/', (req, res) => {
    res.json({ message: "Welcome to the Sportz Express Server!" });
});

// arcjet middleware for  http server
app.use(securityMiddleware());

app.use('/matches',matchRouter);
// with id of specific macth and its commentary
app.use('/matches/:id/commentary', commentaryRouter)
// starts server socket server
const { broadcastMatchCreated, broadcastCommentary } = attachWebSocketServer(server);
app.locals.broadcastMatchCreated = broadcastMatchCreated;
app.locals.broadcastCommentary = broadcastCommentary;

// Start the server
server.listen(PORT,HOST , () => {
    const baseUrl = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
    console.log(`Server is running on ${baseUrl}`);
    console.log(`webSocket server is running on ${baseUrl.replace('http','ws')}/ws`)
});
