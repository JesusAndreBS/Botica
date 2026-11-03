import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../database/prisma.js';

const AUDIT_ACTIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const AUDIT_PATHS = ['/api/products', '/api/sales', '/api/inventory', '/api/users', '/api/alerts'];

export async function auditMiddleware(request: FastifyRequest, reply: FastifyReply) {
  if (!AUDIT_ACTIONS.has(request.method)) return;
  if (!AUDIT_PATHS.some(p => request.url.startsWith(p))) return;

  const userId = (request as any).user?.sub;
  const ip = request.ip;
  const userAgent = request.headers['user-agent'];

  const oldData = ['PATCH', 'PUT', 'DELETE'].includes(request.method) 
    ? await snapshotEntity(request) 
    : null;

  reply.raw.on('finish', async () => {
    if (reply.statusCode >= 400) return;

    const newData = ['POST', 'PATCH', 'PUT'].includes(request.method)
      ? await snapshotEntity(request)
      : null;

    try {
      await prisma.auditLog.create({
        data: {
          userId,
          action: request.method,
          entityType: extractEntityType(request.url),
          entityId: extractEntityId(request.url, request.params),
          oldData: oldData as any,
          newData: newData as any,
          ipAddress: ip,
          userAgent
        }
      });
    } catch (err) {
      request.log.warn({ err }, 'Audit log failed');
    }
  });
}

async function snapshotEntity(request: FastifyRequest) {
  try {
    const entityType = extractEntityType(request.url);
    const entityId = extractEntityId(request.url, request.params);
    if (!entityId) return null;

    switch (entityType) {
      case 'PRODUCT': return await prisma.product.findUnique({ where: { id: entityId } });
      case 'SALE': return await prisma.sale.findUnique({ where: { id: entityId } });
      case 'USER': return await prisma.user.findUnique({ where: { id: entityId } });
      case 'BATCH': return await prisma.batch.findUnique({ where: { id: entityId } });
      default: return null;
    }
  } catch { return null; }
}

function extractEntityType(url: string): string {
  if (url.includes('/products')) return 'PRODUCT';
  if (url.includes('/sales')) return 'SALE';
  if (url.includes('/users')) return 'USER';
  if (url.includes('/inventory')) return 'INVENTORY';
  if (url.includes('/alerts')) return 'ALERT';
  return 'UNKNOWN';
}

function extractEntityId(url: string, params: any): string | null {
  const match = url.match(/\/api\/\w+\/([a-z0-9]{25})/);
  return match?.[1] || params?.id || null;
}