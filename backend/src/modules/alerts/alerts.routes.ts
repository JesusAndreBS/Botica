import { FastifyInstance } from 'fastify';
import { prisma } from '../shared/database/prisma.js';
import { AppError } from '../shared/errors/handler.js';
import { z } from 'zod';

export async function alertsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const user = (request as any).user;
    const { page = 1, limit = 20, type, severity, isResolved, productId } = request.query as any;
    
    const where: any = {};
    if (user.role !== 'ADMIN' && user.role !== 'FARMACÉUTICO') {
      where.assignedToId = user.id;
    }
    if (type) where.type = type;
    if (severity) where.severity = severity;
    if (isResolved !== undefined) where.isResolved = isResolved === 'true';
    if (productId) where.productId = productId;

    const [items, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        include: { product: { select: { id: true, name: true, code: true, stock: true, minStock: true }}, batch: true, assignedTo: { select: { id: true, fullName: true }}},
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.alert.count({ where })
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  app.get('/summary', { preHandler: [app.authenticate] }, async (request) => {
    const user = (request as any).user;
    const where: any = { isResolved: false };
    if (user.role !== 'ADMIN' && user.role !== 'FARMACÉUTICO') where.assignedToId = user.id;

    const [byType, bySeverity, unreadCount] = await Promise.all([
      prisma.alert.groupBy({ by: ['type'], where, _count: { type: true }}),
      prisma.alert.groupBy({ by: ['severity'], where, _count: { severity: true }}),
      prisma.alert.count({ where: { ...where, isRead: false }})
    ]);

    return {
      byType: byType.map(t => ({ type: t.type, count: t._count.type })),
      bySeverity: bySeverity.map(s => ({ severity: s.severity, count: s._count.severity })),
      unreadCount
    };
  });

  app.patch('/:id/read', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as any;
    return prisma.alert.update({ where: { id }, data: { isRead: true }});
  });

  app.patch('/:id/resolve', { preHandler: [app.authenticate] }, async (request) => {
    const user = (request as any).user;
    const { id } = request.params as any;
    
    const alert = await prisma.alert.findUnique({ where: { id }});
    if (!alert) throw new AppError(404, 'NOT_FOUND', 'Alerta no encontrada');

    return prisma.alert.update({
      where: { id },
      data: { isResolved: true, resolvedAt: new Date(), resolvedById: user.id }
    });
  });

  app.post('/bulk-resolve', { preHandler: [app.requireRole('ADMIN', 'FARMACÉUTICO')] }, async (request) => {
    const user = (request as any).user;
    const { ids } = z.object({ ids: z.array(z.string().cuid()).min(1) }).parse(request.body);

    return prisma.alert.updateMany({
      where: { id: { in: ids }},
      data: { isResolved: true, resolvedAt: new Date(), resolvedById: user.id }
    });
  });
}