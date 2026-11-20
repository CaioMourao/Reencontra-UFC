// Emissão e verificação de tokens.
//
// Access token: JWT curto (15 min), vai no cabeçalho Authorization.
//   O front guarda só em memória (nada de localStorage, que é lido por XSS).
// Refresh token: valor aleatório opaco (não é JWT), vai num cookie httpOnly.
//   No banco fica só o hash. A cada uso ele é trocado por outro (rotação).
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from './config.js';
import { prisma } from './db.js';

const ALGORITMO = 'HS256';

export function emitirAccessToken(usuario) {
  return jwt.sign(
    { email: usuario.email, nome: usuario.nome },
    config.JWT_SECRET,
    {
      algorithm: ALGORITMO,
      subject: usuario.id,
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
      expiresIn: config.ACCESS_TOKEN_TTL,
      jwtid: crypto.randomUUID(),
    },
  );
}

/**
 * Verifica o access token. Fixar o algoritmo impede o ataque de trocar
 * o "alg" do cabeçalho (ex.: para "none").
 * @returns {{ valido: true, payload: object } | { valido: false, motivo: string }}
 */
export function verificarAccessToken(token) {
  if (typeof token !== 'string' || token.length === 0 || token.length > 4096) {
    return { valido: false, motivo: 'ausente' };
  }
  try {
    const payload = jwt.verify(token, config.JWT_SECRET, {
      algorithms: [ALGORITMO],
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
    });
    return { valido: true, payload };
  } catch (erro) {
    const motivo = erro instanceof jwt.TokenExpiredError ? 'expirado' : 'invalido';
    return { valido: false, motivo };
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// "db" permite criar o token dentro de uma transação (veja rotacionarRefreshToken)
export async function criarRefreshToken(usuarioId, familia = crypto.randomUUID(), db = prisma) {
  const token = crypto.randomBytes(48).toString('base64url');
  const expiraEm = new Date(Date.now() + config.REFRESH_TOKEN_DIAS * 24 * 60 * 60 * 1000);
  await db.refreshToken.create({
    data: { tokenHash: hashToken(token), familia, usuarioId, expiraEm },
  });
  return { token, expiraEm };
}

// Duas abas abrindo ao mesmo tempo mandam o mesmo cookie quase juntas.
// Dentro desta janela, isso é tratado como uso simultâneo legítimo, não roubo.
const TOLERANCIA_REUSO_MS = 10_000;

async function familiaAtiva(familia) {
  const ativos = await prisma.refreshToken.count({
    where: { familia, revogadoEm: null, expiraEm: { gt: new Date() } },
  });
  return ativos > 0;
}

/**
 * Troca um refresh token válido por um novo (rotação).
 * Se um token já trocado aparecer de novo depois da tolerância, é sinal de
 * roubo: a família toda (a sessão) é revogada.
 * @returns {Promise<{ usuario, token, expiraEm } | null>}
 */
export async function rotacionarRefreshToken(tokenRecebido) {
  if (typeof tokenRecebido !== 'string' || tokenRecebido.length > 200) return null;

  const registro = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(tokenRecebido) },
    include: { usuario: true },
  });
  if (!registro || registro.expiraEm <= new Date()) return null;

  // Marca o token como usado (só se ainda não foi) e cria o próximo na MESMA
  // transação. Assim nunca existe o instante "token antigo revogado, novo ainda
  // não criado": uma requisição concorrente com o mesmo cookie fica esperando
  // o lock da linha no UPDATE e, quando segue, já enxerga o token novo da
  // família. Sem isso, a segunda aba às vezes via a família sem token ativo,
  // tratava como roubo e apagava o cookie (sessão perdida).
  const novo = await prisma.$transaction(async (tx) => {
    const { count } = await tx.refreshToken.updateMany({
      where: { id: registro.id, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
    return count === 1 ? criarRefreshToken(registro.usuarioId, registro.familia, tx) : null;
  });
  if (novo) return { usuario: registro.usuario, ...novo };

  // O token já tinha sido usado. Foi há poucos segundos e a sessão segue ativa?
  const revogadoEm = registro.revogadoEm ?? new Date();
  const recente = Date.now() - revogadoEm.getTime() < TOLERANCIA_REUSO_MS;
  if (recente && (await familiaAtiva(registro.familia))) {
    const outro = await criarRefreshToken(registro.usuarioId, registro.familia);
    return { usuario: registro.usuario, ...outro };
  }

  const revogados = await revogarFamilia(registro.familia);
  // Só registra quando havia sessão ativa: reusar um cookie de quem já fez
  // logout não é incidente.
  if (revogados > 0) {
    console.warn(`[seguranca] reuso de refresh token detectado (usuario ${registro.usuarioId}); sessão revogada`);
  }
  return null;
}

export async function revogarFamilia(familia) {
  const { count } = await prisma.refreshToken.updateMany({
    where: { familia, revogadoEm: null },
    data: { revogadoEm: new Date() },
  });
  return count;
}

export async function revogarPorToken(tokenRecebido) {
  if (typeof tokenRecebido !== 'string' || tokenRecebido.length > 200) return;
  const registro = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(tokenRecebido) },
  });
  if (registro) await revogarFamilia(registro.familia);
}
