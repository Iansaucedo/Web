# Web (Next.js) en modo standalone. Se construye desde la raíz del monorepo:
#   docker compose up -d --build web
# API_INTERNAL_URL se fija AL COMPILAR: Next guarda ahí el destino de /api/* (rewrites).

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
# Solo las dependencias de la web (sin Prisma, Playwright ni la API).
RUN npm ci --workspace=web --include-workspace-root=false --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ARG API_INTERNAL_URL=http://host.docker.internal:4000
ENV API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/web ./apps/web
# npm deja algunas dependencias en apps/web/node_modules (versiones que no coinciden con la raíz): hacen falta las dos.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
RUN npm run build --workspace=web

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# El servidor standalone ya trae lo que necesita de node_modules; faltan los estáticos.
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
