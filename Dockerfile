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

FROM node:22-alpine AS run
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    API_INTERNAL_URL=http://127.0.0.1:4000

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

EXPOSE 3000

CMD ["sh", "-c", "PORT=4000 node apps/api/dist/server.js & PORT=3000 HOSTNAME=0.0.0.0 node apps/web/server.js"]
