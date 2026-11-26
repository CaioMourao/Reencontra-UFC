import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  GRPC_PORT: z.coerce.number().int().min(1).max(65535).default(50053),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  AUTH_GRPC_URL: z.string().min(1).default('localhost:50051'),
  AUTH_PROTO_PATH: z.string().min(1).default('/app/proto/auth.proto'),
  BUSCAS_PROTO_PATH: z.string().min(1).default('/app/proto/buscas.proto'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

const resultado = schema.safeParse(process.env);
if (!resultado.success) {
  console.error('Configuração inválida:');
  for (const issue of resultado.error.issues) {
    console.error('  - ' + issue.path.join('.') + ': ' + issue.message);
  }
  process.exit(1);
}

const env = resultado.data;

export const config = {
  ...env,
  corsOrigins: env.CORS_ORIGINS.split(',').map((origem) => origem.trim()).filter(Boolean),
};
