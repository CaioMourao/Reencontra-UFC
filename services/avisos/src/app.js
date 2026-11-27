import express from 'express';
import helmet from 'helmet';
import { criarRotasAvisos } from './rotas.js';
import { tratarErros } from './erros.js';

export function criarApp(prisma, estaPronto) {
  const app = express();
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 0));
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      res.json({
        status: 'ok',
        rabbitmq: estaPronto() ? 'conectado' : 'reconectando',
      });
    } catch {
      res.status(503).json({ status: 'indisponível' });
    }
  });
  app.use('/avisos', criarRotasAvisos(prisma));
  app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  app.use(tratarErros);
  return app;
}
