FROM node:22-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app/services/correspondencias

COPY services/correspondencias/package.json services/correspondencias/package-lock.json ./
COPY services/correspondencias/prisma.config.mjs ./
COPY services/correspondencias/prisma ./prisma
RUN npm ci --omit=dev && npm cache clean --force

COPY services/correspondencias/src ./src
COPY proto /app/proto

ENV NODE_ENV=production

USER node
EXPOSE 3004
CMD ["sh", "-c", "npx prisma migrate deploy && exec node src/index.js"]
