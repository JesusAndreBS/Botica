import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/modules/auth/auth.plugin.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const adminEmail = 'admin@novasalud.com';
  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });

  if (!existing) {
    const passwordHash = await hashPassword('admin123');
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        fullName: 'Administrador',
        role: 'ADMIN',
        isActive: true
      }
    });
    console.log('✅ Admin user created: admin@novasalud.com / admin123');
  } else {
    console.log('ℹ️ Admin user already exists');
  }

  const categorias = [
    { name: 'Analgésicos', description: 'Medicamentos para el dolor' },
    { name: 'Antibióticos', description: 'Antimicrobianos' },
    { name: 'Vitaminas', description: 'Suplementos vitamínicos' },
    { name: 'Gastrointestinales', description: 'Digestivos, antiácidos' },
    { name: 'Dermatológicos', description: 'Cremas, pomadas' },
    { name: 'Respiratorios', description: 'Jarabes, inhaladores' },
    { name: 'Cardiovasculares', description: 'Hipertensión, corazón' },
    { name: 'Otros', description: 'Productos varios' }
  ];

  for (const cat of categorias) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {},
      create: cat
    });
  }
  console.log('✅ Categorías creadas');

  const proveedor = await prisma.supplier.upsert({
    where: { ruc: '20123456789' },
    update: {},
    create: {
      name: 'Distrifarma SAC',
      ruc: '20123456789',
      contactName: 'Juan Pérez',
      phone: '01-234-5678',
      email: 'ventas@distrifarma.com',
      address: 'Av. Industrial 123, Lima',
      isActive: true
    }
  });
  console.log('✅ Proveedor creado');

  const productos = [
    { code: 'PARA500', barcode: '7751234001234', name: 'Paracetamol 500mg', purchasePrice: 0.45, salePrice: 1.20, minStock: 20, categoryName: 'Analgésicos' },
    { code: 'IBU400', barcode: '7751234001241', name: 'Ibuprofeno 400mg', purchasePrice: 0.55, salePrice: 1.50, minStock: 15, categoryName: 'Analgésicos' },
    { code: 'AMOX500', barcode: '7751234001258', name: 'Amoxicilina 500mg', purchasePrice: 1.20, salePrice: 3.50, minStock: 10, categoryName: 'Antibióticos', requiresRecipe: true },
    { code: 'VITC500', barcode: '7751234001265', name: 'Vitamina C 500mg', purchasePrice: 0.30, salePrice: 1.00, minStock: 30, categoryName: 'Vitaminas' },
    { code: 'OMEP20', barcode: '7751234001272', name: 'Omeprazol 20mg', purchasePrice: 0.80, salePrice: 2.20, minStock: 15, categoryName: 'Gastrointestinales' },
    { code: 'LORAT10', barcode: '7751234001289', name: 'Loratadina 10mg', purchasePrice: 0.40, salePrice: 1.10, minStock: 20, categoryName: 'Respiratorios' },
    { code: 'ASPIR100', barcode: '7751234001296', name: 'Aspirina 100mg', purchasePrice: 0.25, salePrice: 0.80, minStock: 25, categoryName: 'Cardiovasculares' },
    { code: 'DICLO50', barcode: '7751234001302', name: 'Diclofenaco 50mg', purchasePrice: 0.60, salePrice: 1.80, minStock: 10, categoryName: 'Analgésicos', requiresRecipe: true }
  ];

  for (const prod of productos) {
    const cat = await prisma.category.findUnique({ where: { name: prod.categoryName }});
    if (!cat) continue;

    await prisma.product.upsert({
      where: { code: prod.code },
      update: {},
      create: {
        code: prod.code,
        barcode: prod.barcode,
        name: prod.name,
        categoryId: cat.id,
        supplierId: proveedor.id,
        purchasePrice: prod.purchasePrice,
        salePrice: prod.salePrice,
        taxRate: 18,
        minStock: prod.minStock,
        batchTracked: true,
        requiresRecipe: prod.requiresRecipe || false,
        status: 'ACTIVO'
      }
    });
  }
  console.log('✅ Productos de ejemplo creados');

  await prisma.setting.upsert({
    where: { key: 'pos_auto_print' },
    update: {},
    create: { key: 'pos_auto_print', value: true, category: 'POS', description: 'Imprimir ticket automáticamente al cobrar' }
  });

  await prisma.setting.upsert({
    where: { key: 'alert_threshold_days' },
    update: {},
    create: { key: 'alert_threshold_days', value: 30, category: 'STOCK', description: 'Días antes de vencimiento para alertar' }
  });

  console.log('✅ Configuraciones iniciales creadas');
  console.log('🎉 Seed completado!');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });