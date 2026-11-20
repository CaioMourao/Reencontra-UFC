import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { rotas } from './rotas.js';
import { tratarErros } from './middlewares.js';

export function criarApp() {
  const app = express();

  app.set('trust proxy', config.TRUST_PROXY);

  // Cabeçalhos de segurança (CSP, HSTS, nosniff, frameguard...) e remove X-Powered-By
  app.use(helmet());

  // Só as origens listadas em CORS_ORIGINS podem chamar a API pelo navegador
  app.use(
    cors({
      origin(origem, cb) {
        if (!origem || config.corsOrigins.includes(origem)) return cb(null, true);
        return cb(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  );

  // Corpo pequeno: login não precisa de mais que isso
  app.use(express.json({ limit: '10kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/auth', rotas);

  app.use((_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));
  app.use(tratarErros);

  return app;
}
