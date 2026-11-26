import { rateLimit } from 'express-rate-limit';
import { verificarAccessToken } from './tokens.js';

/**
 * Protege uma rota: exige "Authorization: Bearer <token>" válido.
 * Os outros serviços farão o mesmo, só que validando por gRPC
 * (veja shared/auth-grpc-middleware.js).
 */
export function exigirAutenticacao(req, res, next) {
  const [esquema, token] = (req.get('authorization') ?? '').split(' ');
  if (esquema !== 'Bearer' || !token) {
    return res.status(401).json({ erro: 'Autenticação necessária.' });
  }
  const resultado = verificarAccessToken(token);
  if (!resultado.valido) {
    return res
      .status(401)
      .set('WWW-Authenticate', `Bearer error="invalid_token"`)
      .json({ erro: resultado.motivo === 'expirado' ? 'Sessão expirada.' : 'Token inválido.' });
  }
  req.usuario = {
    id: resultado.payload.sub,
    email: resultado.payload.email,
    nome: resultado.payload.nome,
  };
  next();
}

// Limite por IP no login: 10 tentativas a cada 15 minutos.
export const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // só conta as tentativas que falharam
  message: { erro: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
});

export const limiteCadastro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de cadastro. Tente novamente em uma hora.' },
});

export const limiteSolicitarRecuperacao = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Muitas solicitações. Tente novamente mais tarde.' },
});

export const limiteRedefinirSenha = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas. Solicite um novo link mais tarde.' },
});

// Limite geral, mais folgado, para as demais rotas de autenticação.
export const limiteGeral = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Aguarde um pouco.' },
});

// Express 5 já repassa erros de funções async para cá.
// Nunca devolvemos detalhes internos (stack, SQL) ao cliente.
export function tratarErros(erro, req, res, _next) {
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido.' });
  }
  if (erro.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'Requisição grande demais.' });
  }
  console.error(`[erro] ${req.method} ${req.path}:`, erro.message);
  res.status(500).json({ erro: 'Erro interno.' });
}
