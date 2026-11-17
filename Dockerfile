# Imagen completa de producción: API (Express en :4000) + Web (Next.js en :3000)
FROM node:22-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund
RUN npx prisma@5.22.0 generate

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    API_INTERNAL_URL=http://127.0.0.1:4000
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY apps/api ./apps/api
COPY apps/web ./apps/web
RUN npm run build -w api
RUN npm run build -w web

# Solo dependencias de ejecución: vitest, tsx, typescript… (y sus vulnerabilidades) no llegan a producción.
FROM node:22-alpine AS prod
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY prisma ./prisma
RUN npm ci --workspace=api --include-workspace-root --omit=dev --no-audit --no-fund \
 && npx prisma generate \
 && npm cache clean --force

FROM node:22-alpine AS run
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    API_INTERNAL_URL=http://127.0.0.1:4000

# Sin privilegios: el usuario `node` de la imagen base.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma
COPY --from=prod --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=node:node start.js ./
USER node

EXPOSE 3000

CMD ["node", "start.js"]
