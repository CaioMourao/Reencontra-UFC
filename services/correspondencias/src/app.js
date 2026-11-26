import express from 'express';
import helmet from 'helmet';

export function criarApp(prisma, estaPronto) {
  const app = express();
  app.use(helmet());
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRawUnsafe('SELECT 1');
      if (!estaPronto()) return res.status(503).json({ status: 'indisponível' });
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'indisponível' });
    }
  });
  app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  return app;
}
