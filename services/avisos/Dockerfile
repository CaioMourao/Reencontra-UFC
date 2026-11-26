FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/services/avisos

COPY services/avisos/package.json services/avisos/package-lock.json ./
COPY services/avisos/prisma.config.mjs ./
COPY services/avisos/prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY services/avisos/src ./src
COPY proto /app/proto
COPY shared/auth-grpc-middleware.js /app/shared/auth-grpc-middleware.js

ENV NODE_ENV=production

USER node
EXPOSE 3005
CMD ["sh", "-c", "npx prisma migrate deploy && exec node src/index.js"]
