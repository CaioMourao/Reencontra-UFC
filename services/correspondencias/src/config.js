import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3004),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  RABBITMQ_URL: z.string().min(1, 'RABBITMQ_URL é obrigatória'),
  RABBITMQ_EXCHANGE: z.string().min(1).default('achados.eventos'),
  PUBLICACOES_GRPC_URL: z.string().min(1).default('localhost:50052'),
  PUBLICACOES_PROTO_PATH: z.string().min(1).default('/app/proto/publicacoes.proto'),
  BUSCAS_GRPC_URL: z.string().min(1).default('localhost:50053'),
  BUSCAS_PROTO_PATH: z.string().min(1).default('/app/proto/buscas.proto'),
  GRPC_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(5000),
  RABBITMQ_RETRY_MS: z.coerce.number().int().min(250).max(30000).default(2000),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().min(250).max(30000).default(1000),
});

const resultado = schema.safeParse(process.env);
if (!resultado.success) {
  console.error('Configuração inválida:');
  for (const issue of resultado.error.issues) {
    console.error('  - ' + issue.path.join('.') + ': ' + issue.message);
  }
  process.exit(1);
}

export const config = resultado.data;
