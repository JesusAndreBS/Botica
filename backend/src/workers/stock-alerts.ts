import { PrismaClient } from '@prisma/client';
import { config } from '../shared/config/env.js';
import { connectDatabase } from '../shared/database/prisma.js';
import { connectRedis } from '../shared/redis/client.js';
import { emitAlert } from '../shared/socket/server.js';

const prisma = new PrismaClient();

interface AlertInput {
  type: 'BAJO_STOCK' | 'STOCK_CRITICO' | 'PROXIMO_VENCER' | 'VENCIDO' | 'SIN_MOVIMIENTO';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  message: string;
  productId?: string;
  batchId?: string;
  metadata?: Record<string, any>;
}

async function createAlert(data: AlertInput) {
  const existing = await prisma.alert.findFirst({
    where: {
      type: data.type,
      productId: data.productId,
      batchId: data.batchId ?? null,
      isResolved: false
    }
  });

  if (existing) {
    await prisma.alert.update({
      where: { id: existing.id },
      data: { message: data.message, metadata: data.metadata, updatedAt: new Date() }
    });
    return existing;
  }

  const alert = await prisma.alert.create({ data });
  return alert;
}

async function checkStockAlerts() {
  console.log('🔍 Verificando alertas de stock...');

  const products = await prisma.product.findMany({
    where: { status: 'ACTIVO' },
    select: { id: true, code: true, name: true, stock: true, minStock: true, maxStock: true }
  });

  for (const p of products) {
    if (p.stock === 0) {
      await createAlert({
        type: 'STOCK_CRITICO',
        severity: 'CRITICAL',
        title: `Sin stock: ${p.name}`,
        message: `El producto ${p.name} (${p.code}) tiene stock 0. Reposición urgente.`,
        productId: p.id,
        metadata: { currentStock: 0, minStock: p.minStock }
      });
    } else if (p.stock <= p.minStock) {
      await createAlert({
        type: 'BAJO_STOCK',
        severity: 'WARNING',
        title: `Stock bajo: ${p.name}`,
        message: `${p.name} tiene ${p.stock} unidades (mínimo: ${p.minStock}).`,
        productId: p.id,
        metadata: { currentStock: p.stock, minStock: p.minStock }
      });
    }

    if (p.maxStock && p.stock >= p.maxStock) {
      await createAlert({
        type: 'BAJO_STOCK',
        severity: 'INFO',
        title: `Sobre-stock: ${p.name}`,
        message: `${p.name} tiene ${p.stock} unidades (máximo: ${p.maxStock}).`,
        productId: p.id,
        metadata: { currentStock: p.stock, maxStock: p.maxStock }
      });
    }
  }
}

async function checkExpiryAlerts() {
  console.log('📅 Verificando vencimientos...');
  const now = new Date();
  const thresholdDate = new Date(now.getTime() + (config.ALERT_THRESHOLD_DAYS || 30) * 24 * 60 * 60 * 1000);

  const batches = await prisma.batch.findMany({
    where: {
      remainingQty: { gt: 0 },
      expiryDate: { lte: thresholdDate }
    },
    include: { product: { select: { id: true, code: true, name: true }}}
  });

  for (const b of batches) {
    const daysDiff = Math.ceil((b.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff <= 0) {
      await createAlert({
        type: 'VENCIDO',
        severity: 'CRITICAL',
        title: `Vencido: ${b.product.name}`,
        message: `Lote ${b.batchNumber} de ${b.product.name} venció hace ${Math.abs(daysDiff)} días. Stock: ${b.remainingQty}.`,
        productId: b.productId,
        batchId: b.id,
        metadata: { batchNumber: b.batchNumber, daysExpired: Math.abs(daysDiff), remainingQty: b.remainingQty }
      });
    } else if (daysDiff <= 7) {
      await createAlert({
        type: 'PROXIMO_VENCER',
        severity: 'WARNING',
        title: `Vence pronto: ${b.product.name}`,
        message: `Lote ${b.batchNumber} vence en ${daysDiff} días. Stock: ${b.remainingQty}. Considere promoción.`,
        productId: b.productId,
        batchId: b.id,
        metadata: { batchNumber: b.batchNumber, daysToExpiry: daysDiff, remainingQty: b.remainingQty }
      });
    } else {
      await createAlert({
        type: 'PROXIMO_VENCER',
        severity: 'INFO',
        title: `Próximo a vencer: ${b.product.name}`,
        message: `Lote ${b.batchNumber} vence en ${daysDiff} días.`,
        productId: b.productId,
        batchId: b.id,
        metadata: { batchNumber: b.batchNumber, daysToExpiry: daysDiff, remainingQty: b.remainingQty }
      });
    }
  }
}

async function checkNoMovementAlerts() {
  console.log('📦 Verificando productos sin movimiento...');
  const cutoffDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const products = await prisma.product.findMany({
    where: {
      status: 'ACTIVO',
      saleItems: { none: { sale: { createdAt: { gte: cutoffDate }}}}
    },
    select: { id: true, code: true, name: true, stock: true }
  });

  for (const p of products) {
    if (p.stock > 0) {
      await createAlert({
        type: 'SIN_MOVIMIENTO',
        severity: 'INFO',
        title: `Sin movimiento: ${p.name}`,
        message: `${p.name} no tiene ventas en 90 días. Stock actual: ${p.stock}.`,
        productId: p.id,
        metadata: { currentStock: p.stock, daysNoMovement: 90 }
      });
    }
  }
}

async function runChecks() {
  try {
    await checkStockAlerts();
    await checkExpiryAlerts();
    await checkNoMovementAlerts();
    console.log('✅ Verificación de alertas completada');
  } catch (err) {
    console.error('❌ Error en verificación:', err);
  }
}

async function main() {
  console.log('🚀 Iniciando Stock Alert Worker');
  console.log(`⏰ Intervalo: ${config.CHECK_INTERVAL_MINUTES || 15} minutos`);

  await connectDatabase();
  await connectRedis();

  await runChecks();

  setInterval(runChecks, (config.CHECK_INTERVAL_MINUTES || 15) * 60 * 1000);

  process.on('SIGTERM', async () => {
    console.log('🛑 Apagando worker...');
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});