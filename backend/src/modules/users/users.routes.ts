import { FastifyInstance } from 'fastify';
import { prisma } from '../shared/database/prisma.js';
import { AppError } from '../shared/errors/handler.js';
import { z } from 'zod';
import { hashPassword } from '../auth/auth.plugin.js';

const updateUserSchema = z.object({
  fullName: z.string().min(2).optional(),
  role: z.enum(['ADMIN', 'FARMACÉUTICO', 'VENDEDOR', 'CAJERO']).optional(),
  isActive: z.boolean().optional()
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6)
});

export async function usersRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.requireRole('ADMIN')] }, async (request) => {
    const { page = 1, limit = 20, role, isActive } = request.query as any;
    const where: any = {};
    if (role) where.role = role;
    if (isActive !== undefined) where.isActive = isActive === 'true';

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: { id: true, email: true, fullName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.user.count({ where })
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  app.get('/me', { preHandler: [app.authenticate] }, async (request) => {
    const user = (request as any).user;
    const full = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, email: true, fullName: true, role: true, isActive: true, lastLoginAt: true, createdAt: true }
    });
    return full;
  });

  app.patch('/me/password', { preHandler: [app.authenticate] }, async (request) => {
    const user = (request as any).user;
    const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);

    const dbUser = await prisma.user.findUnique({ where: { id: user.id }});
    if (!dbUser) throw new AppError(404, 'NOT_FOUND', 'Usuario no encontrado');

    const { verifyPassword } = await import('../auth/auth.plugin.js');
    const valid = await verifyPassword(currentPassword, dbUser.passwordHash);
    if (!valid) throw new AppError(400, 'INVALID_PASSWORD', 'Contraseña actual incorrecta');

    const newHash = await hashPassword(newPassword);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: newHash }});

    return { success: true };
  });

  app.patch('/:id', { preHandler: [app.requireRole('ADMIN')] }, async (request) => {
    const { id } = request.params as any;
    const data = updateUserSchema.parse(request.body);
    
    const user = await prisma.user.findUnique({ where: { id }});
    if (!user) throw new AppError(404, 'NOT_FOUND', 'Usuario no encontrado');

    return prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, fullName: true, role: true, isActive: true, updatedAt: true }
    });
  });

  app.delete('/:id', { preHandler: [app.requireRole('ADMIN')] }, async (request) => {
    const { id } = request.params as any;
    const user = (request as any).user;
    if (id === user.id) throw new AppError(400, 'SELF_DELETE', 'No puedes eliminarte a ti mismo');

    return prisma.user.update({ where: { id }, data: { isActive: false }});
  });
}