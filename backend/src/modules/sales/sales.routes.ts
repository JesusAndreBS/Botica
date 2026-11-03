import { FastifyInstance } from 'fastify';
import { prisma } from '../shared/database/prisma.js';
import { AppError } from '../shared/errors/handler.js';
import { z } from 'zod';

const saleItemSchema = z.object({
  productId: z.string().cuid(),
  batchId: z.string().cuid().optional().nullable(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().positive(),
  discount: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(100).default(18)
});

const createSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1),
  paymentMethod: z.enum(['EFECTIVO', 'TARJETA_DEBITO', 'TARJETA_CREDITO', 'TRANSFERENCIA', 'MIXTO', 'YAPE_PLIN']),
  paymentDetails: z.record(z.number()).optional().nullable(),
  customerName: z.string().optional().nullable(),
  customerDni: z.string().max(15).optional().nullable(),
  customerPhone: z.string().optional().nullable(),
  discountAmount: z.number().min(0).default(0),
  notes: z.string().optional().nullable()
});

function generateSaleNumber() {
  const date = new Date();
  const prefix = `V-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  return `${prefix}-${Date.now().toString().slice(-6)}`;
}

export async function salesRoutes(app: FastifyInstance) {
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const user = (request as any).user;
    const data = createSaleSchema.parse(request.body);

    const result = await prisma.$transaction(async (tx) => {
      let subtotal = 0;
      let taxAmount = 0;

      for (const item of data.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId }});
        if (!product) throw new AppError(400, 'INVALID_PRODUCT', `Producto ${item.productId} no existe`);
        if (product.stock < item.quantity) throw new AppError(400, 'INSUFFICIENT_STOCK', `Stock insuficiente para ${product.name}`);

        if (product.batchTracked && item.batchId) {
          const batch = await tx.batch.findUnique({ where: { id: item.batchId }});
          if (!batch || batch.remainingQty < item.quantity) {
            throw new AppError(400, 'INSUFFICIENT_BATCH', `Lote insuficiente para ${product.name}`);
          }
        } else if (product.batchTracked && !item.batchId) {
          const batch = await tx.batch.findFirst({
            where: { productId: item.productId, remainingQty: { gte: item.quantity }},
            orderBy: { expiryDate: 'asc' }
          });
          if (!batch) throw new AppError(400, 'NO_BATCH_AVAILABLE', `No hay lote disponible para ${product.name}`);
          item.batchId = batch.id;
        }

        const lineSubtotal = item.quantity * item.unitPrice;
        const lineDiscount = lineSubtotal * (item.discount / 100);
        const lineTaxable = lineSubtotal - lineDiscount;
        const lineTax = lineTaxable * (item.taxRate / 100);

        subtotal += lineSubtotal;
        taxAmount += lineTax;
      }

      const total = subtotal - data.discountAmount + taxAmount;

      const sale = await tx.sale.create({
        data: {
          saleNumber: generateSaleNumber(),
          customerName: data.customerName,
          customerDni: data.customerDni,
          customerPhone: data.customerPhone,
          subtotal,
          taxAmount,
          discountAmount: data.discountAmount,
          total,
          paymentMethod: data.paymentMethod,
          paymentDetails: data.paymentDetails,
          cashierId: user.id,
          notes: data.notes,
          items: {
            create: data.items.map(item => ({
              productId: item.productId,
              batchId: item.batchId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
              discount: item.discount,
              taxRate: item.taxRate,
              lineTotal: item.quantity * item.unitPrice * (1 - item.discount / 100) * (1 + item.taxRate / 100)
            }))
          }
        },
        include: { items: { include: { product: true, batch: true }}}
      });

      for (const item of data.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity }}
        });

        if (item.batchId) {
          await tx.batch.update({
            where: { id: item.batchId },
            data: { remainingQty: { decrement: item.quantity }}
          });
        }

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            batchId: item.batchId,
            type: 'SALIDA',
            quantity: -item.quantity,
            referenceId: sale.id,
            referenceType: 'SALE',
            userId: user.id
          }
        });
      }

      return sale;
    });

    const io = app.io;
    if (io) {
      io.emit('sale:completed', result);
      for (const item of result.items) {
        const product = await prisma.product.findUnique({ where: { id: item.productId }});
        if (product && product.stock <= product.minStock) {
          io.emit('stock:updated', { productId: product.id, newStock: product.stock, delta: -item.quantity });
        }
      }
    }

    return reply.status(201).send(result);
  });

  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { page = 1, limit = 20, startDate, endDate, cashierId, status } = request.query as any;
    const where: any = {};
    if (startDate || endDate) where.createdAt = { gte: startDate ? new Date(startDate) : undefined, lte: endDate ? new Date(endDate) : undefined };
    if (cashierId) where.cashierId = cashierId;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      prisma.sale.findMany({
        where,
        include: { cashier: { select: { id: true, fullName: true }}, items: { include: { product: true }} },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.sale.count({ where })
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  app.get('/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as any;
    const sale = await prisma.sale.findUnique({
      where: { id },
      include: { cashier: { select: { id: true, fullName: true }}, items: { include: { product: true, batch: true }}}
    });
    if (!sale) throw new AppError(404, 'NOT_FOUND', 'Venta no encontrada');
    return sale;
  });

  app.get('/report/daily', { preHandler: [app.authenticate] }, async (request) => {
    const { date } = request.query as any;
    const targetDate = date ? new Date(date) : new Date();
    const start = new Date(targetDate); start.setHours(0, 0, 0, 0);
    const end = new Date(targetDate); end.setHours(23, 59, 59, 999);

    const sales = await prisma.sale.findMany({
      where: { createdAt: { gte: start, lte: end }, status: 'COMPLETADA' },
      include: { items: true, cashier: { select: { fullName: true }}}
    });

    const summary = sales.reduce((acc, s) => {
      acc.totalSales += 1;
      acc.totalAmount += Number(s.total);
      acc.byPayment[s.paymentMethod] = (acc.byPayment[s.paymentMethod] || 0) + Number(s.total);
      return acc;
    }, { totalSales: 0, totalAmount: 0, byPayment: {} as Record<string, number> });

    return { date: targetDate.toISOString().split('T')[0], summary, sales };
  });
}