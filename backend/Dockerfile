FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache dumb-init
ENV PNPM_HOME="/pnpm" PATH="/pnpm/bin:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm run build
RUN pnpm prune --prod

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

FROM base AS worker
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/prisma ./prisma
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/workers/stock-alerts.js"]