import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config.js';
import { criarRotasPublicacoes } from './rotas.js';
import { tratarErros } from './erros.js';

export function criarApp(prisma) {
  const app = express();
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet());
  app.use(cors({
    origin(origem, callback) {
      if (!origem || config.corsOrigins.includes(origem)) return callback(null, true);
      return callback(null, false);
    },
    methods: ['GET', 'POST', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json({ limit: '20kb' }));

  app.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });
  app.use('/publicacoes', criarRotasPublicacoes(prisma));
  app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  app.use(tratarErros);
  return app;
}
