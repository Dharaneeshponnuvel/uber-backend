import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import authRoutes from './routes/auth.js';
import rideRoutes from './routes/rides.js';
import driverRoutes from './routes/drivers.js';
import paymentRoutes from './routes/payments.js';
import userRoutes from './routes/users.js';
import { initializeSocket } from './utils/socket.js';

dotenv.config();

const app = express();
const server = createServer(app);

const allowedOrigins = [
  "https://uber-frontend-gamma.vercel.app", // deployed frontend
  "http://localhost:5173"                   // vite dev
];

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true
  }
});

// Middleware
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);

app.use(express.json());

// Initialize Socket.IO
initializeSocket(io);

// Make io available to routes
app.set('io', io);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Uber Clone API is running' });
});

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Uber Clone API running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready for real-time connections`);
});

export { io };
