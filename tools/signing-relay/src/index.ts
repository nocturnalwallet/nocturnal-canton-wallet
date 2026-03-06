import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { httpRouter } from './http-api.js';
import { setupSocketHandler } from './socket-handler.js';

const PORT = parseInt(process.env.PORT || '4100', 10);
const CORS_ORIGINS = process.env.CORS_ORIGINS?.split(',') || ['*'];
const RELAY_API_KEY = process.env.RELAY_API_KEY || '';

const app = express();
app.use(express.json());

// Health check (unauthenticated)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'signing-relay' });
});

// Bearer token auth middleware for HTTP API routes
if (RELAY_API_KEY) {
  app.use((req, res, next) => {
    // Skip health check
    if (req.path === '/health') return next();

    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${RELAY_API_KEY}`) {
      res.status(401).json({ error: 'unauthorized', error_description: 'Invalid or missing API key' });
      return;
    }
    next();
  });
}

// Blockdaemon-compatible HTTP API
app.use(httpRouter);

const httpServer = createServer(app);

// Socket.io server for extension connections
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGINS,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});

// Socket.io auth middleware
if (RELAY_API_KEY) {
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token === RELAY_API_KEY) {
      return next();
    }
    next(new Error('Authentication failed: invalid API key'));
  });
}

setupSocketHandler(io);

httpServer.listen(PORT, () => {
  console.log(`[Signing Relay] Listening on port ${PORT}`);
  console.log(`[Signing Relay] CORS origins: ${CORS_ORIGINS.join(', ')}`);
  console.log(`[Signing Relay] Auth: ${RELAY_API_KEY ? 'API key required' : 'DISABLED (no RELAY_API_KEY set)'}`);
  console.log(`[Signing Relay] HTTP endpoints: /signTransaction, /getKeys, /createKey, /getTransaction, /getTransactions`);
  console.log(`[Signing Relay] Socket.io: waiting for extension connections...`);
});
