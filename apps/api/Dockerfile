# API (Express + Prisma) para producción en Azure App Service / Container Apps
FROM node:22-alpine AS deps
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY prisma ./prisma
RUN npm ci --workspace=api --no-audit --no-fund
RUN npx prisma@5.22.0 generate

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY apps/api ./apps/api
RUN npm run build --workspace=api

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
    PORT=4000

# Sin privilegios: el usuario `node` de la imagen base, dueño solo de lo que necesita.
COPY --chown=node:node package.json package-lock.json ./
COPY --chown=node:node prisma ./prisma
COPY --from=prod --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
USER node

EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 4000) + '/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/api/dist/server.js"]
