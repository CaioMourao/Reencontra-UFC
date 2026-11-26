// Lê e valida as variáveis de ambiente na inicialização.
// Se algo essencial estiver faltando ou fraco, o serviço nem sobe.
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().default(3001),
  GRPC_PORT: z.coerce.number().int().default(50051),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET precisa ter pelo menos 32 caracteres (gere com: openssl rand -base64 48)'),
  JWT_ISSUER: z.string().default('reencontra-autenticacao'),
  JWT_AUDIENCE: z.string().default('reencontra'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_DIAS: z.coerce.number().int().positive().default(7),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  // Número de proxies (ex.: Nginx) na frente do serviço, para o rate limit
  // enxergar o IP real do cliente.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  // Caminho público por onde o navegador chama este serviço (via proxy do
  // Vite ou do Nginx). O cookie de refresh só é enviado para esse caminho.
  COOKIE_PATH: z.string().startsWith('/').default('/api/auth'),
  BCRYPT_CUSTO: z.coerce.number().int().min(10).max(15).default(12),
  ALLOWED_EMAIL_DOMAINS: z.string().default(''),
  RESEND_API_KEY: z.string().default(''),
  EMAIL_FROM: z.string().default(''),
  APP_BASE_URL: z.url().default('http://localhost:8080'),
}).superRefine((env, contexto) => {
  const url = new URL(env.APP_BASE_URL);
  const protocolo = url.protocol;
  const hostLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(protocolo)) {
    contexto.addIssue({ code: 'custom', path: ['APP_BASE_URL'], message: 'Use uma URL HTTP ou HTTPS.' });
  }
  if (env.NODE_ENV === 'production' && protocolo !== 'https:' && !hostLocal) {
    contexto.addIssue({ code: 'custom', path: ['APP_BASE_URL'], message: 'Em produção, use HTTPS fora de endereços locais.' });
  }
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
  emProducao: env.NODE_ENV === 'production',
  corsOrigins: env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  login: {
    maxTentativasPorConta: 5,
    bloqueioMinutos: 15,
  },
  cadastro: {
    dominiosPermitidos: env.ALLOWED_EMAIL_DOMAINS.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean),
  },
  email: {
    resendApiKey: env.RESEND_API_KEY,
    remetente: env.EMAIL_FROM,
    baseUrl: env.APP_BASE_URL.replace(/\/+$/, ''),
  },
};
