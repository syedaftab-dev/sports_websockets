import 'dotenv/config';
import express from 'express';
import { matchRouter } from './routes/matches.js';
import http from 'http';
import { attachWebSocketServer } from './ws/server.js';

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


app.use('/matches',matchRouter);

const { broadcastMatchCreated } = attachWebSocketServer(server);
app.locals.broadcastMatchCreated = broadcastMatchCreated;

// Start the server
server.listen(PORT,HOST , () => {
    const baseUrl = HOST === '0.0.0.0' ? `http://localhost:${PORT}` : `http://${HOST}:${PORT}`;
    console.log(`Server is running on ${baseUrl}`);
    console.log(`webSocket server is running on ${baseUrl.replace('http','ws')}/ws`)
});
