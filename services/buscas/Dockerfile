FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/services/buscas

COPY services/buscas/package.json services/buscas/package-lock.json ./
COPY services/buscas/prisma.config.mjs ./
COPY services/buscas/prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY services/buscas/src ./src
COPY proto /app/proto
COPY shared/auth-grpc-middleware.js /app/shared/auth-grpc-middleware.js

ENV NODE_ENV=production

USER node
EXPOSE 3003 50053
CMD ["sh", "-c", "npx prisma migrate deploy && exec node src/index.js"]
