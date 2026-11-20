# Build a partir da raiz do repositório (precisa da pasta proto/):
#   docker build -f services/autenticacao/Dockerfile .
FROM node:22-slim

# O Prisma precisa do OpenSSL para o motor de migrações
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/services/autenticacao

COPY services/autenticacao/package.json services/autenticacao/package-lock.json ./
COPY services/autenticacao/prisma.config.mjs ./
COPY services/autenticacao/prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY services/autenticacao/src ./src
COPY proto /app/proto

ENV NODE_ENV=production \
    AUTH_PROTO_PATH=/app/proto/auth.proto

# Não roda como root dentro do contêiner
USER node

EXPOSE 3001 50051
# "exec" faz o Node virar o processo principal e receber o SIGTERM do
# "docker compose down" (senão o sh engole o sinal e o desligamento não é limpo)
CMD ["sh", "-c", "npx prisma migrate deploy && exec node src/index.js"]
