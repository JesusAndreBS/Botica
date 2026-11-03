import { Server as SocketIOServer, Socket } from 'socket.io';
import { FastifyInstance } from 'fastify';
import { verifyToken } from '../modules/auth/auth.utils.js';
import { prisma } from '../database/prisma.js';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

export async function registerSocket(app: FastifyInstance) {
  const io = new SocketIOServer(app.server, {
    cors: {
      origin: process.env.CORS_ORIGIN,
      credentials: true
    }
  });

  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication required'));
      
      const payload = await verifyToken(token);
      socket.userId = payload.sub;
      socket.userRole = payload.role;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`🔌 Client connected: ${socket.userId} (${socket.userRole})`);
    
    socket.join(`user:${socket.userId}`);
    socket.join(`role:${socket.userRole}`);

    socket.on('subscribe:alerts', () => {
      socket.join('alerts');
    });

    socket.on('subscribe:sales', () => {
      socket.join('sales');
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.userId}`);
    });
  });

  app.decorate('io', io);
  
  console.log('✅ Socket.io server ready');
}

export function emitAlert(io: SocketIOServer, alert: any) {
  io.to('alerts').emit('alert:new', alert);
  io.to(`role:FARMACÉUTICO`).emit('notification:toast', {
    message: alert.title,
    type: alert.severity === 'CRITICAL' ? 'error' : 'warning'
  });
}

export function emitStockUpdate(io: SocketIOServer, productId: string, newStock: number, delta: number) {
  io.to('alerts').emit('stock:updated', { productId, newStock, delta });
}

export function emitSaleCompleted(io: SocketIOServer, sale: any) {
  io.to('sales').emit('sale:completed', sale);
}

export function emitAlertResolved(io: SocketIOServer, alertId: string) {
  io.to('alerts').emit('alert:resolved', { alertId });
}