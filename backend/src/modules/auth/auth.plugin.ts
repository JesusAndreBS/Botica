import { FastifyInstance } from 'fastify';
import { prisma } from '../shared/database/prisma.js';
import { AppError } from '../shared/errors/handler.js';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { sign, verify } from 'jsonwebtoken';
import { config } from '../shared/config/env.js';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6)
});

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(2),
  role: z.enum(['ADMIN', 'FARMACÉUTICO', 'VENDEDOR', 'CAJERO']).default('VENDEDOR')
});

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateAccessToken(user: { id: string; email: string; role: string }) {
  return sign(
    { sub: user.id, email: user.email, role: user.role },
    config.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

export function generateRefreshToken(userId: string) {
  return sign(
    { sub: userId, type: 'refresh' },
    config.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function verifyToken(token: string) {
  return verify(token, config.JWT_SECRET) as { sub: string; email: string; role: string };
}

export async function authPlugin(app: FastifyInstance) {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        throw new AppError(401, 'UNAUTHORIZED', 'Token requerido');
      }
      const token = authHeader.split(' ')[1];
      const payload = await verifyToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) {
        throw new AppError(401, 'UNAUTHORIZED', 'Usuario inactivo');
      }
      (request as any).user = { id: user.id, email: user.email, role: user.role };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(401, 'INVALID_TOKEN', 'Token inválido o expirado');
    }
  });

  app.decorate('requireRole', (...roles: string[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await request.server.authenticate(request, reply);
      const user = (request as any).user;
      if (!roles.includes(user.role)) {
        throw new AppError(403, 'FORBIDDEN', 'Permisos insuficientes');
      }
    };
  });
}