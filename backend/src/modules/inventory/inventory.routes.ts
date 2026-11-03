import { FastifyInstance } from 'fastify';
import { prisma } from '../shared/database/prisma.js';
import { AppError } from '../shared/errors/handler.js';
import { z } from 'zod';

const receiveSchema = z.object({
  purchaseOrderId: z.string().cuid().optional().nullable(),
  items: z.array(z.object({
    productId: z.string().cuid(),
    batchNumber: z.string().min(1),
    quantity: z.number().int().positive(),
    expiryDate: z.string().datetime(),
    purchasePrice: z.number().positive(),
    manufactureDate: z.string().datetime().optional().nullable()
  })).min(1)
});

const adjustSchema = z.object({
  productId: z.string().cuid(),
  batchId: z.string().cuid().optional().nullable(),
  newQuantity: z.number().int().min(0),
  reason: z.string().min(1)
});

export async function inventoryRoutes(app: FastifyInstance) {
  app.post('/receive', { preHandler: [app.requireRole('ADMIN', 'FARMACÉUTICO')] }, async (request, reply) => {
    const user = (request as any).user;
    const data = receiveSchema.parse(request.body);

    const result = await prisma.$transaction(async (tx) => {
      for (const item of data.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId }});
        if (!product) throw new AppError(400, 'INVALID_PRODUCT', `Producto ${item.productId} no existe`);

        const batch = await tx.batch.create({
          data: {
            productId: item.productId,
            batchNumber: item.batchNumber,
            quantity: item.quantity,
            remainingQty: item.quantity,
            expiryDate: new Date(item.expiryDate),
            manufactureDate: item.manufactureDate ? new Date(item.manufactureDate) : null,
            purchasePrice: item.purchasePrice
          }
        });

        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity }}
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            batchId: batch.id,
            type: 'ENTRADA',
            quantity: item.quantity,
            referenceId: data.purchaseOrderId,
            referenceType: 'PURCHASE',
            userId: user.id
          }
        });
      }
      return { received: data.items.length };
    });

    return reply.status(201).send(result);
  });

  app.post('/adjust', { preHandler: [app.requireRole('ADMIN', 'FARMACÉUTICO')] }, async (request) => {
    const user = (request as any).user;
    const data = adjustSchema.parse(request.body);

    const product = await prisma.product.findUnique({ where: { id: data.productId }});
    if (!product) throw new AppError(404, 'NOT_FOUND', 'Producto no encontrado');

    const diff = data.newQuantity - product.stock;

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: data.productId },
        data: { stock: data.newQuantity }
      });

      if (data.batchId) {
        await tx.batch.update({
          where: { id: data.batchId },
          data: { remainingQty: data.newQuantity }
        });
      }

      await tx.stockMovement.create({
        data: {
          productId: data.productId,
          batchId: data.batchId,
          type: 'AJUSTE',
          quantity: diff,
          reason: data.reason,
          userId: user.id
        }
      });
    });

    return { success: true, previousStock: product.stock, newStock: data.newQuantity };
  });

  app.get('/movements/:productId', { preHandler: [app.authenticate] }, async (request) => {
    const { productId } = request.params as any;
    const { page = 1, limit = 50 } = request.query as any;

    const [items, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where: { productId },
        include: { batch: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.stockMovement.count({ where: { productId }})
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  app.get('/valuation', { preHandler: [app.requireRole('ADMIN', 'FARMACÉUTICO')] }, async () => {
    const products = await prisma.product.findMany({
      where: { status: 'ACTIVO', stock: { gt: 0 }},
      include: { batches: { where: { remainingQty: { gt: 0 }}}}
    });

    let totalValue = 0;
    const details = products.map(p => {
      const batchesValue = p.batches.reduce((sum, b) => sum + Number(b.purchasePrice) * b.remainingQty, 0);
      totalValue += batchesValue;
      return { productId: p.id, name: p.name, stock: p.stock, value: batchesValue };
    });

    return { totalValue, details };
  });
}