import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3002),
  GRPC_PORT: z.coerce.number().int().min(1).max(65535).default(50052),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  AUTH_GRPC_URL: z.string().min(1).default('localhost:50051'),
  AUTH_PROTO_PATH: z.string().min(1).default('/app/proto/auth.proto'),
  PUBLICACOES_PROTO_PATH: z.string().min(1).default('/app/proto/publicacoes.proto'),
  RABBITMQ_URL: z.string().min(1, 'RABBITMQ_URL é obrigatória'),
  RABBITMQ_EXCHANGE: z.string().min(1).default('achados.eventos'),
  PUBLICACOES_CODE_SECRET: z
    .string()
    .min(32, 'PUBLICACOES_CODE_SECRET precisa ter pelo menos 32 caracteres.'),
  PUBLICACOES_UPLOAD_DIR: z.string().min(1).default('./uploads'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().min(250).max(30000).default(1000),
});

const resultado = schema.safeParse(process.env);
if (!resultado.success) {
  console.error('Configuração inválida:');
  for (const issue of resultado.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

const env = resultado.data;

export const config = {
  ...env,
  corsOrigins: env.CORS_ORIGINS.split(',').map((origem) => origem.trim()).filter(Boolean),
};
