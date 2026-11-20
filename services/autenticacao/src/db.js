// No Prisma 7 a conexão é feita por um "driver adapter" (aqui, o pg).
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from './config.js';

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: config.DATABASE_URL }),
});
