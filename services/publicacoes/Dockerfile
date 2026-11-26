# Build a partir da raiz do repositório (usa protos e middleware compartilhados).
FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/services/publicacoes

COPY services/publicacoes/package.json services/publicacoes/package-lock.json ./
COPY services/publicacoes/prisma.config.mjs ./
COPY services/publicacoes/prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY services/publicacoes/src ./src
COPY proto /app/proto
COPY shared/auth-grpc-middleware.js /app/shared/auth-grpc-middleware.js
RUN mkdir -p uploads && chown node:node uploads

ENV NODE_ENV=production

USER node
EXPOSE 3002 50052
CMD ["sh", "-c", "npx prisma migrate deploy && exec node src/index.js"]
