import { FastifyInstance } from 'fastify';
import { prisma } from '../shared/database/prisma.js';
import { AppError } from '../shared/errors/handler.js';
import { loginSchema, registerSchema, hashPassword, verifyPassword, generateAccessToken, generateRefreshToken } from './auth.plugin.js';

export async function authRoutes(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
    const { email, password } = loginSchema.parse(request.body);
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = generateRefreshToken(user.id);

    return reply.send({
      accessToken,
      refreshToken,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role }
    });
  });

  app.post('/register', { preHandler: [app.requireRole('ADMIN')] }, async (request, reply) => {
    const data = registerSchema.parse(request.body);
    
    const exists = await prisma.user.findUnique({ where: { email: data.email } });
    if (exists) throw new AppError(409, 'EMAIL_EXISTS', 'El email ya está registrado');

    const passwordHash = await hashPassword(data.password);
    const user = await prisma.user.create({
      data: { ...data, passwordHash },
      select: { id: true, email: true, fullName: true, role: true, createdAt: true }
    });

    return reply.status(201).send(user);
  });

  app.post('/refresh', async (request, reply) => {
    const { refreshToken } = z.object({ refreshToken: z.string() }).parse(request.body);
    try {
      const payload = await verifyToken(refreshToken);
      if (payload.type !== 'refresh') throw new Error();
      
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (!user || !user.isActive) throw new Error();

      const accessToken = generateAccessToken({ id: user.id, email: user.email, role: user.role });
      const newRefreshToken = generateRefreshToken(user.id);

      return { accessToken, refreshToken: newRefreshToken };
    } catch {
      throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token inválido');
    }
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const user = (request as any).user;
    return { id: user.id, email: user.email, role: user.role };
  });
}