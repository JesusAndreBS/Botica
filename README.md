# 🏥 Nova Salud - Sistema de Gestión para Botica

Sistema web completo para gestionar inventario, ventas (POS), alertas de stock y usuarios de una botica. Diseñado para ser **rápido, bonito y fácil de usar**.

---

## ✨ Qué incluye

| Módulo | Qué hace |
|--------|----------|
| **POS (Caja)** | Venta rápida con escáner, carrito lateral, múltiples pagos, impresión ticket |
| **Alertas Stock** | Worker automático cada 15 min → detecta stock bajo, vencidos, sin movimiento → notificación en tiempo real |
| **Inventario** | Productos, lotes (FEFO), proveedores, categorías, ajustes, kardex, valorización |
| **Ventas** | Historial, reporte diario, devoluciones, cierre de caja |
| **Usuarios** | Roles (Admin, Farmacéutico, Vendedor, Cajero), auditoría completa |

---

## 🛠 Stack Tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS + Zustand + TanStack Query |
| Backend | Node.js 20 + Fastify + Prisma ORM + Socket.io + JWT |
| Base de Datos | PostgreSQL 16 + Redis 7 |
| Contenedores | Docker + Docker Compose (multi-stage) |
| Proxy | Nginx (SSL, rate limit, WebSocket proxy) |

---

## 🚀 Cómo levantar en 3 minutos

### Prerrequisitos
- Docker Desktop / Docker Engine + Docker Compose v2
- Puerto 5173 (frontend), 3001 (backend), 5432 (postgres), 6379 (redis) libres

### 1. Clonar y entrar
```bash
cd nova-salud
```

### 2. Configurar variables (solo la primera vez)
```bash
cp .env.example .env
# Edita .env si quieres cambiar passwords (los defaults funcionan para dev)
```

### 3. Levantar todo
```bash
docker compose -f docker-compose.dev.yml up --build
```

> Primera vez tarda ~2-3 min (descarga imágenes, instala dependencias). Las siguientes arranca en ~15 seg.

### 4. Abrir en el navegador
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3001
- **Health check**: http://localhost:3001/health

### 5. Login de prueba
```
Email:    admin@novasalud.com
Password: admin123
```
> El usuario admin se crea automáticamente en el primer arranque (seed en backend).

---

## 📁 Estructura del proyecto (lo importante)

```
nova-salud/
├── docker-compose.yml          # Producción
├── docker-compose.dev.yml      # Desarrollo (hot reload)
├── backend/
│   ├── src/
│   │   ├── index.ts            # Entry point Fastify
│   │   ├── modules/            # Cada feature = carpeta
│   │   │   ├── auth/           # Login, JWT, roles
│   │   │   ├── products/       # CRUD productos
│   │   │   ├── sales/          # POS transaccional
│   │   │   ├── inventory/      # Recepción, ajustes, kardex
│   │   │   ├── alerts/         # Dashboard alertas
│   │   │   └── users/          # Administración usuarios
│   │   └── shared/             # Código compartido
│   │       ├── database/       # Prisma client
│   │       ├── redis/          # Redis client + pub/sub
│   │       ├── socket/         # Socket.io server
│   │       ├── middleware/     # Auth, rate limit, auditoría
│   │       └── config/         # Validación env con Zod
│   ├── prisma/
│   │   └── schema.prisma       # Esquema BD completo
│   └── Dockerfile.dev
├── frontend/
│   ├── src/
│   │   ├── app/                # App shell, rutas, layout
│   │   ├── features/           # Cada feature = carpeta
│   │   │   ├── auth/           # Login
│   │   │   ├── pos/            # POS principal (¡el corazón!)
│   │   │   ├── alerts/         # Dashboard alertas
│   │   │   ├── inventory/      # Productos
│   │   │   ├── sales/          # Reporte ventas
│   │   │   └── settings/       # Perfil, usuarios, sistema
│   │   └── shared/             # API client, hooks, tipos
│   └── Dockerfile.dev
└── README.md
```

---

## 🔧 Comandos útiles

```bash
# Ver logs en tiempo real
docker compose -f docker-compose.dev.yml logs -f backend

# Entrar al contenedor backend
docker compose -f docker-compose.dev.yml exec backend sh

# Migraciones BD (desarrollo)
docker compose -f docker-compose.dev.yml exec backend pnpm prisma migrate dev

# Prisma Studio (UI para ver/editrar BD)
docker compose -f docker-compose.dev.yml exec backend pnpm prisma studio
# Abre http://localhost:5555

# Resetear BD completamente
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up --build

# Solo backend + BD (frontend en local con pnpm dev)
docker compose -f docker-compose.dev.yml up postgres redis backend -d
```

---

## 🎯 Flujo POS rápido (diseñado para < 30 seg/venta)

1. **Enciende** → Pantalla POS enfoca escáner automáticamente
2. **Escanea** código de barras → Busca producto instantáneo (cache)
3. **Si tiene lote** → Modal FEFO (primero el que vence antes) → Click para agregar
4. **Repite** para más productos → Carrito lateral se actualiza en vivo
5. **Opcional**: DNI cliente → Enter
6. **Elige pago**: Efectivo / Tarjeta / Yape / Mixto
7. **Si efectivo** → Escribe monto → Vuelto automático
8. **Cobrar** → Transacción atómica (venta + descuento stock + movimientos + lotes)
9. **Imprime** ticket → Toast "Stock bajo" si aplica → Listo para siguiente

---

## 🔔 Alertas automáticas (worker cada 15 min)

| Tipo | Cuándo dispara | Severidad |
|------|----------------|-----------|
| `STOCK_CRITICO` | Stock = 0 | 🔴 CRITICAL |
| `BAJO_STOCK` | Stock ≤ mínimo | 🟡 WARNING |
| `PROXIMO_VENCER` | Vence en ≤ 30 días | 🟡 WARNING |
| `VENCIDO` | Fecha vencimiento pasada | 🔴 CRITICAL |
| `SIN_MOVIMIENTO` | 90 días sin venta | 🔵 INFO |

> Llegan por WebSocket al dashboard en tiempo real. Farmacéutico ve badge rojo en sidebar → Click → "Generar Orden Compra" / "Resolver".

---

## 🔐 Roles y permisos

| Rol | Qué ve / Qué hace |
|-----|-------------------|
| **Admin** | Todo: usuarios, config, BD, auditoría |
| **Farmacéutico** | Productos, alertas, inventario, recepción OC, ajustes |
| **Vendedor** | POS, productos (solo lectura), alertas propias |
| **Cajero** | Solo POS (venta rápida) |

---

## 🐛 Solución de problemas comunes

| Problema | Solución |
|----------|----------|
| `Port 5173 already in use` | `lsof -ti:5173 | xargs kill -9` o cierra el proceso |
| `Database connection failed` | `docker compose -f docker-compose.dev.yml restart postgres` y espera 10 seg |
| `Module not found` en frontend | `docker compose -f docker-compose.dev.yml exec frontend pnpm install` |
| Cambios en backend no recargan | El `tsx watch` recarga solo archivos `.ts`. Si tocaste `prisma/schema.prisma` → `pnpm prisma generate` dentro del contenedor |
| WebSocket no conecta | Revisa que `VITE_WS_URL` en `.env` apunte a `ws://localhost:3001` |

---

## 📦 Producción (resumen)

```bash
# 1. Generar secrets reales
openssl rand -hex 32  # JWT_SECRET
openssl rand -base64 32  # DB_PASSWORD

# 2. Configurar .env.production con valores reales + dominio + certs SSL

# 3. Levantar
docker compose --env-file .env.production up -d --build

# 4. Migraciones
docker compose exec backend pnpm prisma migrate deploy
```

> Nginx termina SSL, sirve estáticos con cache largo, proxyea `/api` y `/ws` al backend.

---

## 🤝 Contribuir / Personalizar

1. **Nuevo módulo**: Crea carpeta en `backend/src/modules/` y `frontend/src/features/` → Registra rutas en `index.ts` / `App.tsx`
2. **Cambiar UI**: Tailwind en clases directamente. Componentes base en `frontend/src/shared/ui/`
3. **Nuevo campo BD**: `prisma/schema.prisma` → `pnpm prisma migrate dev` → Tipos se regeneran solos
4. **Endpoint nuevo**: Controller → Service → Routes → Schema Zod → Register en `index.ts`

---

## 📄 Licencia

MIT - Úsalo libremente para tu botica o proyecto.

---

**Hecho con 💙 para que Nova Salud deje de usar papel y lápiz.**