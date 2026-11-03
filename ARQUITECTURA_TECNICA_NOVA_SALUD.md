# Propuesta Técnica Completa - Sistema de Gestión "Nova Salud"

## 1. Stack Tecnológico Obligatorio

| Capa | Tecnología | Versión | Justificación |
|------|------------|---------|---------------|
| **Frontend** | React 18 + TypeScript | 18.x | SPA reactiva, component-based, ecosistema maduro |
| **State Management** | Zustand | 4.x | Ligero, zero-boilerplate, TypeScript nativo |
| **UI Library** | shadcn/ui + Tailwind CSS | Latest | Accesible, personalizable, sin runtime overhead |
| **Routing** | React Router v6 | 6.x | Estándar de facto, data loading nativo |
| **Forms/Validation** | React Hook Form + Zod | Latest | Performante, type-safe validation |
| **HTTP Client** | TanStack Query (React Query) | 5.x | Server state, caching, optimistic updates |
| **Backend** | Node.js + Fastify | 20 LTS / 4.x | Alto rendimiento, bajo overhead, plugin ecosystem |
| **ORM** | Prisma ORM | 5.x | Type-safe DB access, migrations, DX excelente |
| **Auth** | Better Auth (o NextAuth v5) | Latest | Modern auth, session management, extensible |
| **Base de Datos** | PostgreSQL | 16 | ACID, JSONB, full-text search, madurez |
| **Cache/Session** | Redis | 7.x | Sesiones, rate limiting, cache queries |
| **Tiempo Real** | Socket.io | 4.x | Alertas stock, notificaciones POS en vivo |
| **Contenedores** | Docker + Docker Compose | Latest | Despliegue consistente, aislamiento |
| **Proxy Reverso** | Nginx | Alpine | SSL termination, static files, load balancing |
| **Monitoreo** | Prometheus + Grafana | Latest | Métricas, alertas infraestructura |

---

## 2. Estructura de Contenedores (Docker)

### 2.1 docker-compose.yml (Raíz del proyecto)

```yaml
version: '3.8'

services:
  # ─────────────────────────────────────────────
  # BASE DE DATOS
  # ─────────────────────────────────────────────
  postgres:
    image: postgres:16-alpine
    container_name: nova-postgres
    environment:
      POSTGRES_DB: nova_salud
      POSTGRES_USER: nova_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./db/init:/docker-entrypoint-initdb.d
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U nova_user -d nova_salud"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - nova-network

  # ─────────────────────────────────────────────
  # CACHE / SESIONES / PUB-SUB
  # ─────────────────────────────────────────────
  redis:
    image: redis:7-alpine
    container_name: nova-redis
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - nova-network

  # ─────────────────────────────────────────────
  # BACKEND API (Fastify + Prisma + Socket.io)
  # ─────────────────────────────────────────────
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
      target: production
    container_name: nova-backend
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://nova_user:${DB_PASSWORD}@postgres:5432/nova_salud?schema=public
      REDIS_URL: redis://redis:6379
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGIN: https://${DOMAIN}
      PORT: 3001
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "3001:3001"
    volumes:
      - ./backend/uploads:/app/uploads
    networks:
      - nova-network
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  # ─────────────────────────────────────────────
  # FRONTEND (React + Vite + Nginx)
  # ─────────────────────────────────────────────
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      target: production
    container_name: nova-frontend
    environment:
      VITE_API_URL: https://${DOMAIN}/api
      VITE_WS_URL: wss://${DOMAIN}/ws
    depends_on:
      - backend
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./frontend/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    networks:
      - nova-network
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M

  # ─────────────────────────────────────────────
  # WORKER: ALERTAS DE STOCK (Background Jobs)
  # ─────────────────────────────────────────────
  stock-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile.worker
    container_name: nova-stock-worker
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://nova_user:${DB_PASSWORD}@postgres:5432/nova_salud?schema=public
      REDIS_URL: redis://redis:6379
      ALERT_THRESHOLD_DAYS: 30
      CHECK_INTERVAL_MINUTES: 15
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - nova-network
    deploy:
      replicas: 1
      resources:
        limits:
          cpus: '0.25'
          memory: 128M

volumes:
  postgres_data:
  redis_data:

networks:
  nova-network:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

### 2.2 Backend - Dockerfile (Multi-stage)

```dockerfile
# ─────────────────────────────────────────────
# BACKEND - Dockerfile (Multi-stage)
# ─────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init
ENV PNPM_HOME="/pnpm" PATH="/pnpm/bin:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

# ─────────────────────────────────────────────
# DEPENDENCIES
# ─────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# ─────────────────────────────────────────────
# BUILD
# ─────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build
RUN pnpm prune --prod

# ─────────────────────────────────────────────
# PRODUCTION
# ─────────────────────────────────────────────
FROM base AS production
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
USER node
EXPOSE 3001
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/index.js"]

# ─────────────────────────────────────────────
# WORKER (Stock Alerts)
# ─────────────────────────────────────────────
FROM base AS worker
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/workers/stock-alerts.js"]
```

### 2.3 Frontend - Dockerfile (Multi-stage + Nginx)

```dockerfile
# ─────────────────────────────────────────────
# FRONTEND - Dockerfile (Multi-stage)
# ─────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate

# ─────────────────────────────────────────────
# DEPENDENCIES
# ─────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────
# BUILD
# ─────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG VITE_API_URL
ARG VITE_WS_URL
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_WS_URL=${VITE_WS_URL}
RUN pnpm run build

# ─────────────────────────────────────────────
# PRODUCTION (Nginx)
# ─────────────────────────────────────────────
FROM nginx:alpine AS production
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
```

### 2.4 Frontend - nginx.conf

```nginx
# /frontend/nginx.conf
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

    upstream backend {
        server backend:3001;
        keepalive 32;
    }

    server {
        listen 80;
        listen [::]:80;
        server_name _;
        return 301 https://$host$request_uri;
    }

    server {
        listen 443 ssl http2;
        listen [::]:443 ssl http2;
        server_name _;

        ssl_certificate /etc/nginx/certs/fullchain.pem;
        ssl_certificate_key /etc/nginx/certs/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers HIGH:!aNULL:!MD5;

        root /usr/share/nginx/html;
        index index.html;

        # Security headers
        add_header X-Frame-Options "SAMEORIGIN";
        add_header X-Content-Type-Options "nosniff";
        add_header Referrer-Policy "strict-origin-when-cross-origin";
        add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self' wss: https:;";

        # Static assets - long cache
        location /assets/ {
            expires 1y;
            add_header Cache-Control "public, immutable";
            try_files $uri =404;
        }

        # API Proxy
        location /api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 60s;
            proxy_send_timeout 60s;
        }

        # WebSocket
        location /ws/ {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_read_timeout 86400;
        }

        # Auth endpoints - stricter rate limit
        location /api/auth/login {
            limit_req zone=login burst=3 nodelay;
            proxy_pass http://backend;
            # ... same proxy config as /api/
        }

        # SPA fallback
        location / {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

### 2.5 Variables de Entorno (.env.example)

```bash
# .env.example (copiar a .env y completar)
# ─────────────────────────────────────────────
# GENERAL
# ─────────────────────────────────────────────
DOMAIN=novasalud.local
NODE_ENV=production

# ─────────────────────────────────────────────
# BASE DE DATOS
# ─────────────────────────────────────────────
DB_PASSWORD=genera_password_seguro_aqui

# ─────────────────────────────────────────────
# AUTENTICACIÓN
# ─────────────────────────────────────────────
JWT_SECRET=genera_clave_hex_64_chars_aqui

# ─────────────────────────────────────────────
# ALERTAS STOCK
# ─────────────────────────────────────────────
ALERT_THRESHOLD_DAYS=30
CHECK_INTERVAL_MINUTES=15
```

---

## 3. Diseño de Base de Datos (PostgreSQL + Prisma)

### 3.1 Esquema Prisma (`backend/prisma/schema.prisma`)

```prisma
// ─────────────────────────────────────────────
// PRISMA SCHEMA - Nova Salud
// ─────────────────────────────────────────────
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────
enum UserRole {
  ADMIN
  FARMACÉUTICO
  VENDEDOR
  CAJERO
}

enum ProductStatus {
  ACTIVO
  INACTIVO
  DESCONTINUADO
  RESTRINGIDO
}

enum SaleStatus {
  PENDIENTE
  COMPLETADA
  CANCELADA
  DEVUELTA
}

enum PaymentMethod {
  EFECTIVO
  TARJETA_DEBITO
  TARJETA_CREDITO
  TRANSFERENCIA
  MIXTO
  YAPE_PLIN
}

enum AlertType {
  BAJO_STOCK
  STOCK_CRITICO
  PROXIMO_VENCER
  VENCIDO
  SIN_MOVIMIENTO
}

enum AlertSeverity {
  INFO
  WARNING
  CRITICAL
}

// ─────────────────────────────────────────────
// MODELOS PRINCIPALES
// ─────────────────────────────────────────────

model User {
  id            String    @id @default(cuid())
  email         String    @unique
  passwordHash  String
  fullName      String
  role          UserRole  @default(VENDEDOR)
  isActive      Boolean   @default(true)
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  sales         Sale[]    @relation("SaleCashier")
  alerts        Alert[]   @relation("AlertAssigned")

  @@index([email])
  @@index([role, isActive])
  @@map("users")
}

model Category {
  id          String    @id @default(cuid())
  name        String    @unique
  description String?
  parentId    String?
  parent      Category? @relation("CategoryHierarchy", fields: [parentId], references: [id])
  children    Category[] @relation("CategoryHierarchy")
  products    Product[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([parentId])
  @@map("categories")
}

model Supplier {
  id          String    @id @default(cuid())
  name        String
  ruc         String?   @unique
  contactName String?
  phone       String?
  email       String?
  address     String?
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  products    Product[]

  @@index([ruc])
  @@index([isActive])
  @@map("suppliers")
}

model Product {
  id              String        @id @default(cuid())
  code            String        @unique @db.VarChar(50) // Código interno / SKU
  barcode         String?       @unique @db.VarChar(100) // Código de barras
  name            String        @db.VarChar(200)
  description     String?
  categoryId      String
  category        Category      @relation(fields: [categoryId], references: [id])
  supplierId      String?
  supplier        Supplier?     @relation(fields: [supplierId], references: [id])

  // Precios
  purchasePrice   Decimal       @db.Decimal(12, 4) // Precio compra
  salePrice       Decimal       @db.Decimal(12, 4) // Precio venta público
  wholesalePrice  Decimal?      @db.Decimal(12, 4) // Precio mayorista
  taxRate         Decimal       @default(0) @db.Decimal(5, 2) // IGV %

  // Stock
  stock           Int           @default(0)
  minStock        Int           @default(10)
  maxStock        Int?          // Para alertas de sobre-stock
  batchTracked    Boolean       @default(true) // Lotes/Fechas vencimiento
  requiresRecipe  Boolean       @default(false) // Medicamento controlado

  // Estado
  status          ProductStatus @default(ACTIVO)
  imageUrl        String?

  // Trazabilidad
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  // Relaciones
  batches         Batch[]
  saleItems       SaleItem[]
  stockMovements  StockMovement[]
  alerts          Alert[]

  @@index([code])
  @@index([barcode])
  @@index([categoryId, status])
  @@index([supplierId])
  @@index([status, stock])
  @@fulltext([name, description])
  @@map("products")
}

model Batch {
  id            String    @id @default(cuid())
  productId     String
  product       Product   @relation(fields: [productId], references: [id], onDelete: Cascade)
  batchNumber   String    @db.VarChar(50)
  quantity      Int
  remainingQty  Int
  expiryDate    DateTime
  manufactureDate DateTime?
  purchasePrice Decimal   @db.Decimal(12, 4)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  stockMovements StockMovement[]

  @@unique([productId, batchNumber])
  @@index([expiryDate])
  @@index([productId, expiryDate])
  @@map("batches")
}

model Sale {
  id              String       @id @default(cuid())
  saleNumber      String       @unique @db.VarChar(20) // N° correlativo: V-000001
  customerName    String?
  customerDni     String?      @db.VarChar(15)
  customerPhone   String?
  subtotal        Decimal      @db.Decimal(12, 4)
  taxAmount       Decimal      @db.Decimal(12, 4)
  discountAmount  Decimal      @default(0) @db.Decimal(12, 4)
  total           Decimal      @db.Decimal(12, 4)
  paymentMethod   PaymentMethod
  paymentDetails  Json?        // {efectivo: 50, cambio: 5, yape: 45}
  status          SaleStatus   @default(COMPLETADA)
  cashierId       String
  cashier         User         @relation("SaleCashier", fields: [cashierId], references: [id])
  notes           String?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  items           SaleItem[]

  @@index([saleNumber])
  @@index([cashierId, createdAt])
  @@index([status, createdAt])
  @@index([customerDni])
  @@map("sales")
}

model SaleItem {
  id            String    @id @default(cuid())
  saleId        String
  sale          Sale      @relation(fields: [saleId], references: [id], onDelete: Cascade)
  productId     String
  product       Product   @relation(fields: [productId], references: [id])
  batchId       String?
  batch         Batch?    @relation(fields: [batchId], references: [id])
  quantity      Int
  unitPrice     Decimal   @db.Decimal(12, 4)
  discount      Decimal   @default(0) @db.Decimal(12, 4)
  taxRate       Decimal   @db.Decimal(5, 2)
  lineTotal     Decimal   @db.Decimal(12, 4)
  createdAt     DateTime  @default(now())

  @@index([saleId])
  @@index([productId])
  @@index([batchId])
  @@map("sale_items")
}

model StockMovement {
  id              String   @id @default(cuid())
  productId       String
  product         Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  batchId         String?
  batch           Batch?   @relation(fields: [batchId], references: [id])
  type            String   // ENTRADA, SALIDA, AJUSTE, TRANSFERENCIA, DEVOLUCION, VENCIMIENTO
  quantity        Int      // Positivo = entrada, Negativo = salida
  referenceId     String?  // SaleId, PurchaseOrderId, AdjustmentId
  referenceType   String?  // SALE, PURCHASE, ADJUSTMENT, EXPIRY
  reason          String?
  userId          String?
  createdAt       DateTime @default(now())

  @@index([productId, createdAt])
  @@index([batchId])
  @@index([referenceId, referenceType])
  @@map("stock_movements")
}

model Alert {
  id            String       @id @default(cuid())
  type          AlertType
  severity      AlertSeverity
  title         String
  message       String
  productId     String?
  product       Product?     @relation(fields: [productId], references: [id])
  batchId       String?
  batch         Batch?       @relation(fields: [batchId], references: [id])
  assignedToId  String?
  assignedTo    User?        @relation("AlertAssigned", fields: [assignedToId], references: [id])
  isRead        Boolean      @default(false)
  isResolved    Boolean      @default(false)
  resolvedAt    DateTime?
  resolvedById  String?
  metadata      Json?        // {currentStock: 5, minStock: 10, daysToExpiry: 15}
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  @@index([type, severity, isResolved])
  @@index([productId, isResolved])
  @@index([assignedToId, isRead])
  @@index([createdAt])
  @@map("alerts")
}

model AuditLog {
  id          String   @id @default(cuid())
  userId      String?
  action      String   // CREATE, UPDATE, DELETE, LOGIN, LOGOUT, SALE, ADJUSTMENT
  entityType  String   // PRODUCT, SALE, USER, BATCH, SETTINGS
  entityId    String?
  oldData     Json?
  newData     Json?
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime @default(now())

  @@index([userId, createdAt])
  @@index([entityType, entityId])
  @@index([action, createdAt])
  @@map("audit_logs")
}

model Setting {
  id        String   @id @default(cuid())
  key       String   @unique
  value     Json
  category  String   // GENERAL, POS, STOCK, NOTIFICATIONS, PRINTING
  description String?
  updatedAt DateTime @updatedAt

  @@index([category])
  @@map("settings")
}
```

### 3.2 Migraciones Iniciales (SQL Raw para índices compuestos críticos)

```sql
-- backend/prisma/migrations/20240101_init/additional_indexes.sql

-- Índice parcial para alertas de stock crítico no resueltas
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_alerts_stock_critical_unresolved
ON alerts (product_id, type, severity)
WHERE is_resolved = false AND type IN ('BAJO_STOCK', 'STOCK_CRITICO');

-- Índice para búsquedas POS por código de barras + estado activo
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_pos_lookup
ON products (barcode, code, status)
WHERE status = 'ACTIVO';

-- Índice para reporte de ventas por rango de fechas + cajero
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_report_range
ON sales (cashier_id, created_at DESC, status)
WHERE status = 'COMPLETADA';

-- Índice para lotes próximos a vencer con stock restante
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_batches_expiring_soon
ON batches (expiry_date, product_id, remaining_qty)
WHERE remaining_qty > 0;
```

---

## 4. Flujos de Trabajo Clave (User Flows)

### 4.1 Flujo POS - Venta Rápida en Caja (< 30 seg)

```mermaid
sequenceDiagram
    participant C as Cajero (Frontend)
    participant API as Backend API
    participant DB as PostgreSQL
    participant WS as Socket.io
    participant W as Stock Worker

    Note over C,W: INICIO DE SESIÓN (Una vez al día)
    C->>API: POST /auth/login {email, password}
    API->>DB: Validar credenciales + role
    API-->>C: JWT Access + Refresh Token
    C->>WS: Conectar WebSocket (auth token)

    Note over C,W: VENTA RÁPIDA
    C->>C: Escanear código de barras (Scanner USB/Bluetooth)
    C->>API: GET /products/by-barcode/:barcode
    API->>DB: SELECT * FROM products WHERE barcode = ? AND status = 'ACTIVO'
    API-->>C: Producto {id, name, price, stock, batchTracked}

    alt Producto con lote (batchTracked)
        C->>API: GET /products/:id/available-batches
        API->>DB: SELECT * FROM batches WHERE productId=? AND remainingQty>0 ORDER BY expiryDate ASC
        API-->>C: Lotes disponibles (FEFO - First Expired First Out)
    end

    C->>C: Agregar al carrito (optimistic UI)
    C->>C: Repetir para siguientes items
    C->>C: [Opcional] Buscar cliente por DNI
    C->>API: GET /customers/by-dni/:dni
    C->>C: Seleccionar método de pago
    C->>API: POST /sales {items[], paymentMethod, customerId?}
    
    Note over API,DB: TRANSACCIÓN ATÓMICA
    API->>DB: BEGIN
    API->>DB: INSERT INTO sales ...
    API->>DB: INSERT INTO sale_items ...
    API->>DB: UPDATE products SET stock = stock - qty WHERE id IN ...
    API->>DB: UPDATE batches SET remainingQty = remainingQty - qty WHERE id IN ...
    API->>DB: INSERT INTO stock_movements (type='SALIDA', referenceType='SALE')...
    API->>DB: COMMIT
    API-->>C: Sale {id, saleNumber, total, items[]}

    C->>C: Imprimir ticket (Bluetooth/USB)
    C->>WS: Emit 'sale:completed' {saleId, items[]}
    WS->>W: Notificar worker para verificación stock
    W->>DB: Verificar stock < minStock
    W->>DB: INSERT INTO alerts (type='BAJO_STOCK')...
    WS->>C: Broadcast 'alert:stock' {productId, currentStock, minStock}
    C->>C: Mostrar toast "Stock bajo: Paracetamol 500mg (3/10)"
```

#### Pantallas POS - Componentes Clave

| Componente | Responsabilidad | Optimización |
|------------|-----------------|--------------|
| `PosScanner` | Input código barras (enter = submit) | `onKeyDown` capture, focus lock |
| `PosCart` | Carrito lateral (slide-in) | Virtualized list, optimistic add |
| `PosProductSearch` | Búsqueda por nombre/código | Debounced 300ms, TanStack Query cache |
| `PosPayment` | Modal pago (efectivo, tarjeta, mixto) | Cálculo cambio automático |
| `PosCustomerLookup` | Buscar DNI (Reniec/Sunat opcional) | Cache 24h localStorage |
| `PosReceipt` | Ticket thermal 80mm | Template handlebars, print raw |

---

### 4.2 Flujo Alertas de Stock - Reposición Proactiva

```mermaid
sequenceDiagram
    participant W as Stock Worker (Cron 15min)
    participant DB as PostgreSQL
    participant WS as Socket.io
    participant F as Farmacéutico/Admin (Frontend)
    participant P as Proveedor (Email/WhatsApp API)

    Note over W,P: EJECUCIÓN PROGRAMADA (Cada 15 min)
    W->>DB: SELECT p.*, b.expiryDate FROM products p
    W->>DB: LEFT JOIN batches b ON b.productId=p.id AND b.remainingQty>0
    W->>DB: WHERE p.status='ACTIVO' AND p.batchTracked=true

    Note over W,DB: REGLA 1: Stock Crítico (stock = 0)
    W->>DB: INSERT INTO alerts (type='STOCK_CRITICAL', severity='CRITICAL')...
    W->>WS: Broadcast 'alert:new' {type: 'STOCK_CRITICAL', productId}

    Note over W,DB: REGLA 2: Bajo Stock (stock <= minStock)
    W->>DB: INSERT INTO alerts (type='BAJO_STOCK', severity='WARNING')...
    W->>WS: Broadcast 'alert:new' {type: 'BAJO_STOCK', productId}

    Note over W,DB: REGLA 3: Próximo a Vencer (30 días)
    W->>DB: INSERT INTO alerts (type='PROXIMO_VENCER', severity='WARNING', metadata={daysToExpiry})...
    W->>WS: Broadcast 'alert:new' ...

    Note over W,DB: REGLA 4: Vencido
    W->>DB: INSERT INTO alerts (type='VENCIDO', severity='CRITICAL')...
    W->>WS: Broadcast 'alert:new' ...

    Note over W,DB: REGLA 5: Sin Movimiento (90 días)
    W->>DB: INSERT INTO alerts (type='SIN_MOVIMIENTO', severity='INFO')...
    W->>WS: Broadcast 'alert:new' ...

    F->>WS: Conectado (recibe alertas en tiempo real)
    WS->>F: Notificación push + Badge en sidebar
    F->>F: Click alerta → Abre "Gestión de Alertas"
    F->>API: GET /alerts?type=BAJO_STOCK&isResolved=false
    F->>F: Vista: Producto | Stock Actual | Mínimo | Proveedor | Última Compra
    F->>F: Acción: "Generar Orden Compra" / "Ajustar Mínimo" / "Marcar Resuelto"
    F->>API: POST /purchase-orders {items[], supplierId}
    F->>P: Enviar orden (Email API / WhatsApp Business API)
    P-->>F: Confirmación recepción
    F->>API: PATCH /alerts/:id {isResolved: true, resolvedById: userId}
    API->>WS: Broadcast 'alert:resolved' {alertId}
```

#### Dashboard Alertas - Vista Farmacéutico

```
┌─────────────────────────────────────────────────────────────────┐
│  🔔 ALERTAS DE STOCK                          [3 CRÍTICAS] [12] │
├─────────────────────────────────────────────────────────────────┤
│  🔴 CRÍTICO (3)    🟡 ADVERTENCIA (8)    🔵 INFO (1)            │
├─────────────────────────────────────────────────────────────────┤
│  ☐ [🔴] STOCK_CRITICAL   Amoxicilina 500mg     Stock: 0/20     │
│       Proveedor: Lab. Chile    Última compra: 15 días          │
│       [Generar OC] [Ajustar Mín] [Resolver]                     │
│  ☐ [🔴] VENCIDO          Ibuprofeno 400mg      Lote: L-2024-001│
│       Vencido: 2024-10-15      Stock: 12 unidades              │
│       [Retirar] [Resolver]                                      │
│  ☐ [🟡] BAJO_STOCK       Paracetamol 500mg     Stock: 3/10     │
│       Proveedor: Distrifarma   Última compra: 45 días          │
│       [Generar OC] [Ajustar Mín] [Resolver]                     │
│  ☐ [🟡] PROXIMO_VENCER   Omeprazol 20mg       Vence en 12 días │
│       Lote: L-2024-089         Stock: 45 unidades              │
│       [Promocionar] [Resolver]                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4.3 Flujo Gestión Inventario - Ajuste y Recepción

```mermaid
sequenceDiagram
    participant F as Farmacéutico
    participant API as Backend
    participant DB as PostgreSQL
    participant WS as Socket.io

    Note over F,WS: RECEPCIÓN MERCADERÍA (Orden Compra)
    F->>API: GET /purchase-orders/:id
    F->>F: Verificar items vs factura proveedor
    F->>API: POST /inventory/receive {purchaseOrderId, items: [{productId, batchNumber, qty, expiryDate, purchasePrice}]}
    
    API->>DB: BEGIN
    API->>DB: INSERT INTO batches (productId, batchNumber, quantity, remainingQty, expiryDate, purchasePrice)...
    API->>DB: UPDATE products SET stock = stock + qty WHERE id IN ...
    API->>DB: INSERT INTO stock_movements (type='ENTRADA', referenceType='PURCHASE')...
    API->>DB: UPDATE purchase_orders SET status='RECIBIDA'...
    API->>DB: COMMIT
    API-->>F: Success
    API->>WS: Broadcast 'stock:updated' {productId, newStock}
    WS->>F: Toast "Stock actualizado: Vitamina C 500mg (+100)"

    Note over F,WS: AJUSTE DE INVENTARIO (Conteo físico)
    F->>API: POST /inventory/adjust {productId, batchId?, newQuantity, reason}
    
    API->>DB: BEGIN
    API->>DB: SELECT stock FROM products WHERE id=?
    API->>DB: UPDATE products SET stock=? WHERE id=?
    API->>DB: IF batchId: UPDATE batches SET remainingQty=? WHERE id=?
    API->>DB: INSERT INTO stock_movements (type='AJUSTE', quantity=diff, reason)...
    API->>DB: COMMIT
    API-->>F: Success
    API->>WS: Broadcast 'stock:updated' + 'alert:check'
```

---

## 5. APIs REST - Endpoints Principales

### 5.1 Autenticación
```
POST   /auth/login              # Login + JWT
POST   /auth/refresh            # Refresh token
POST   /auth/logout             # Revoke refresh token
GET    /auth/me                 # Perfil usuario actual
```

### 5.2 Productos
```
GET    /products                # Listado paginado, filtros, búsqueda
GET    /products/:id            # Detalle + lotes + movimientos
GET    /products/by-barcode/:code  # Lookup POS (rápido)
POST   /products                # Crear (Admin/Farmacéutico)
PATCH  /products/:id            # Actualizar
DELETE /products/:id            # Soft delete (status=INACTIVO)
GET    /products/:id/batches    # Lotes disponibles (FEFO)
GET    /products/low-stock      # Productos stock <= minStock
```

### 5.3 Ventas (POS)
```
POST   /sales                   # Crear venta (transaccional)
GET    /sales                   # Historial paginado
GET    /sales/:id               # Detalle venta + items
POST   /sales/:id/refund        # Devolución parcial/total
GET    /sales/report/daily      # Reporte diario (cierre caja)
GET    /sales/report/range      # Reporte rango fechas
```

### 5.4 Inventario
```
POST   /inventory/receive       # Recepción OC
POST   /inventory/adjust        # Ajuste manual
GET    /inventory/movements     # Kardex producto
GET    /inventory/valuation     # Valorización inventario (FIFO)
```

### 5.5 Alertas
```
GET    /alerts                  # Listado con filtros
PATCH  /alerts/:id/read         # Marcar leída
PATCH  /alerts/:id/resolve      # Resolver
POST   /alerts/bulk-resolve     # Resolver múltiples
GET    /alerts/summary          # Contadores por tipo/severidad
```

### 5.6 WebSocket Events
```
Client → Server:
  - auth:token
  - subscribe:alerts
  - subscribe:sales

Server → Client:
  - alert:new {alert}
  - alert:resolved {alertId}
  - stock:updated {productId, newStock, delta}
  - sale:completed {sale}
  - notification:toast {message, type}
```

---

## 6. Seguridad y Cumplimiento

| Medida | Implementación |
|--------|----------------|
| **Autenticación** | JWT Access (15min) + Refresh (7d, rotación, revocación) |
| **Autorización** | RBAC por role (middleware Fastify) |
| **Rate Limiting** | 10 req/s general, 5 req/min login, 100 req/min POS |
| **CORS** | Origen exacto (domain configurado), credentials true |
| **Helmet** | CSP, HSTS, X-Frame, Referrer-Policy |
| **Validación** | Zod schemas en todos los inputs |
| **Sanitización** | DOMPurify en frontend, escape en logs |
| **Auditoría** | AuditLog en todas las mutaciones críticas |
| **Encriptación** | bcryptjs (12 rounds) para passwords |
| **Secrets** | Docker secrets / .env no commiteado |
| **SSL** | Let's Encrypt + Nginx termination |
| **Backups** | pg_dump cron (diario), point-in-time recovery |

---

## 7. Comandos de Despliegue

```bash
# ─────────────────────────────────────────────
# DESARROLLO
# ─────────────────────────────────────────────
cp .env.example .env
# Editar .env con valores locales

# Levantar todo (hot reload)
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build

# Solo backend + DB (frontend en local: pnpm dev)
docker compose up postgres redis backend -d

# ─────────────────────────────────────────────
# PRODUCCIÓN
# ─────────────────────────────────────────────
# 1. Generar secrets seguros
openssl rand -hex 32  # JWT_SECRET
openssl rand -base64 32  # DB_PASSWORD

# 2. Configurar .env.production
cp .env.example .env.production
# Completar valores reales

# 3. Obtener certificados SSL (Let's Encrypt)
# O usar certs propios en ./certs/

# 4. Desplegar
docker compose --env-file .env.production up -d --build

# 5. Verificar salud
docker compose ps
curl -f https://novasalud.local/api/health

# ─────────────────────────────────────────────
# MIGRACIONES DB
# ─────────────────────────────────────────────
# Desarrollo
docker compose exec backend pnpm prisma migrate dev

# Producción
docker compose exec backend pnpm prisma migrate deploy

# ─────────────────────────────────────────────
# BACKUP / RESTORE
# ─────────────────────────────────────────────
# Backup
docker compose exec postgres pg_dump -U nova_user nova_salud > backup_$(date +%F).sql

# Restore
cat backup_2024-01-15.sql | docker compose exec -T postgres psql -U nova_user nova_salud
```

---

## 8. Estructura de Carpetas del Proyecto

```
nova-salud/
├── .github/
│   └── workflows/           # CI/CD (lint, test, build, deploy)
├── backend/
│   ├── src/
│   │   ├── modules/         # Feature modules (products, sales, inventory, alerts, auth, users)
│   │   │   ├── products/
│   │   │   │   ├── products.controller.ts
│   │   │   │   ├── products.service.ts
│   │   │   │   ├── products.routes.ts
│   │   │   │   ├── products.schemas.ts (Zod)
│   │   │   │   └── index.ts
│   │   │   ├── sales/
│   │   │   ├── inventory/
│   │   │   ├── alerts/
│   │   │   ├── auth/
│   │   │   └── users/
│   │   ├── shared/
│   │   │   ├── database/    # Prisma client + extensions
│   │   │   ├── redis/       # Redis client + helpers
│   │   │   ├── socket/      # Socket.io server + events
│   │   │   ├── errors/      # AppError, error handler
│   │   │   ├── middleware/  # auth, rateLimit, validation, audit
│   │   │   ├── utils/       # date, currency, pagination
│   │   │   └── config/      # env validation (Zod)
│   │   ├── workers/
│   │   │   └── stock-alerts.ts  # Cron job verificación stock
│   │   └── index.ts         # App entry point
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── Dockerfile
│   ├── Dockerfile.worker
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── app/             # App shell, providers, routes
│   │   ├── features/        # Feature modules
│   │   │   ├── pos/         # POS components, hooks, types
│   │   │   ├── inventory/   # Productos, lotes, ajustes
│   │   │   ├── alerts/      # Dashboard alertas, gestión
│   │   │   ├── sales/       # Historial, reportes, devoluciones
│   │   │   ├── auth/        # Login, profile
│   │   │   └── settings/    # Configuración sistema
│   │   ├── shared/
│   │   │   ├── ui/          # shadcn/ui components
│   │   │   ├── hooks/       # useAuth, useToast, useWebSocket
│   │   │   ├── api/         # TanStack Query hooks, axios instance
│   │   │   ├── types/       # Types compartidos (generados de Prisma)
│   │   │   └── utils/       # formatters, validators
│   │   └── main.tsx
│   ├── nginx.conf
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── docker-compose.yml
├── docker-compose.dev.yml
├── .env.example
├── README.md
└── AGENTS.md                # Instrucciones para agents IA
```

---

## 9. Métricas de Éxito (KPIs)

| Métrica | Objetivo | Medición |
|---------|----------|----------|
| **Tiempo atención POS** | < 30 seg/venta | Timestamp sale.createdAt - primer scan |
| **Errores inventario** | < 0.5% | Diferencia conteo físico vs sistema / mes |
| **Alertas resueltas < 24h** | > 90% | alert.resolvedAt - alert.createdAt |
| **Disponibilidad sistema** | 99.9% | Uptime monitor (excluye mantenimiento) |
| **Tiempo carga POS inicial** | < 2 seg | Web Vitals (LCP) |
| **Stockouts críticos/mes** | 0 | Alertas STOCK_CRITICAL generadas |

---

## 10. Próximos Pasos Recomendados

1. **Sprint 0 (Semana 1)**: Setup repo, CI/CD, Docker, DB, Auth básico
2. **Sprint 1 (Semana 2-3)**: CRUD Productos + Categorías + Proveedores
3. **Sprint 2 (Semana 4-5)**: POS Ventas + Carrito + Pagos + Impresión
4. **Sprint 3 (Semana 6)**: Inventario (Lotes, Ajustes, Recepción OC, Kardex)
5. **Sprint 4 (Semana 7)**: Alertas Stock (Worker, Dashboard, Notificaciones WS)
6. **Sprint 5 (Semana 8)**: Reportes, Auditoría, Configuración, Testing E2E
7. **Sprint 6 (Semana 9)**: UAT, Capacitación, Despliegue Producción, Go-live

---

*Documento generado como propuesta técnica base. Requiere validación con stakeholders y ajustes según requisitos específicos de Nova Salud.*