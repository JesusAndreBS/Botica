import Fastify from 'fastify';
import { config } from './shared/config/env.js';
import { connectDatabase } from './shared/database/prisma.js';
import { connectRedis } from './shared/redis/client.js';
import { registerSocket } from './shared/socket/server.js';
import { errorHandler } from './shared/errors/handler.js';
import { auditMiddleware } from './shared/middleware/audit.js';
import { authPlugin } from './modules/auth/auth.plugin.js';
import { productsRoutes } from './modules/products/products.routes.js';
import { salesRoutes } from './modules/sales/sales.routes.js';
import { inventoryRoutes } from './modules/inventory/inventory.routes.js';
import { alertsRoutes } from './modules/alerts/alerts.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss Z', ignore: 'pid,hostname' }
    }
  }
});

app.setErrorHandler(errorHandler);

await app.register(import('@fastify/helmet'), {
  contentSecurityPolicy: false
});

await app.register(import('@fastify/cors'), {
  origin: config.CORS_ORIGIN,
  credentials: true
});

await app.register(import('@fastify/rate-limit'), {
  max: 100,
  timeWindow: '1 minute'
});

await app.register(authPlugin);

await connectDatabase();
await connectRedis();

await registerSocket(app);

app.addHook('onRequest', auditMiddleware);

app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

await app.register(productsRoutes, { prefix: '/api/products' });
await app.register(salesRoutes, { prefix: '/api/sales' });
await app.register(inventoryRoutes, { prefix: '/api/inventory' });
await app.register(alertsRoutes, { prefix: '/api/alerts' });
await app.register(usersRoutes, { prefix: '/api/users' });

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
  app.log.info(`🚀 Server running on http://localhost:${config.PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}