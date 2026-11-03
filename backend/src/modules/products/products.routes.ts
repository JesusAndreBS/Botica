import { FastifyInstance } from 'fastify';
import { prisma } from '../shared/database/prisma.js';
import { AppError } from '../shared/errors/handler.js';
import { z } from 'zod';

const productSchema = z.object({
  code: z.string().min(1).max(50),
  barcode: z.string().max(100).optional().nullable(),
  name: z.string().min(1).max(200),
  description: z.string().optional().nullable(),
  categoryId: z.string().cuid(),
  supplierId: z.string().cuid().optional().nullable(),
  purchasePrice: z.number().positive(),
  salePrice: z.number().positive(),
  wholesalePrice: z.number().positive().optional().nullable(),
  taxRate: z.number().min(0).max(100).default(18),
  minStock: z.number().int().min(0).default(10),
  maxStock: z.number().int().positive().optional().nullable(),
  batchTracked: z.boolean().default(true),
  requiresRecipe: z.boolean().default(false),
  imageUrl: z.string().url().optional().nullable()
});

export async function productsRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: [app.authenticate] }, async (request) => {
    const { page = 1, limit = 20, search, categoryId, status, lowStock } = request.query as any;
    const where: any = {};
    if (search) where.OR = [{ name: { contains: search, mode: 'insensitive' }}, { code: { contains: search }}, { barcode: { contains: search }}];
    if (categoryId) where.categoryId = categoryId;
    if (status) where.status = status;
    if (lowStock === 'true') where.stock = { lte: prisma.product.fields.minStock };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true, supplier: true },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.product.count({ where })
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  });

  app.get('/by-barcode/:barcode', { preHandler: [app.authenticate] }, async (request) => {
    const { barcode } = request.params as any;
    const product = await prisma.product.findUnique({
      where: { barcode },
      include: { category: true, batches: { where: { remainingQty: { gt: 0 }}, orderBy: { expiryDate: 'asc' }}}
    });
    if (!product || product.status !== 'ACTIVO') throw new AppError(404, 'NOT_FOUND', 'Producto no encontrado');
    return product;
  });

  app.get('/:id', { preHandler: [app.authenticate] }, async (request) => {
    const { id } = request.params as any;
    const product = await prisma.product.findUnique({
      where: { id },
      include: { category: true, supplier: true, batches: { orderBy: { expiryDate: 'asc' }}}
    });
    if (!product) throw new AppError(404, 'NOT_FOUND', 'Producto no encontrado');
    return product;
  });

  app.post('/', { preHandler: [app.requireRole('ADMIN', 'FARMACÉUTICO')] }, async (request, reply) => {
    const data = productSchema.parse(request.body);
    const product = await prisma.product.create({ data, include: { category: true, supplier: true } });
    return reply.status(201).send(product);
  });

  app.patch('/:id', { preHandler: [app.requireRole('ADMIN', 'FARMACÉUTICO')] }, async (request) => {
    const { id } = request.params as any;
    const data = productSchema.partial().parse(request.body);
    return prisma.product.update({ where: { id }, data, include: { category: true, supplier: true }});
  });

  app.delete('/:id', { preHandler: [app.requireRole('ADMIN')] }, async (request) => {
    const { id } = request.params as any;
    return prisma.product.update({ where: { id }, data: { status: 'INACTIVO' }});
  });

  app.get('/low-stock', { preHandler: [app.authenticate] }, async () => {
    return prisma.product.findMany({
      where: { status: 'ACTIVO', stock: { lte: prisma.product.fields.minStock }},
      include: { category: true, supplier: true },
      orderBy: { stock: 'asc' }
    });
  });
}