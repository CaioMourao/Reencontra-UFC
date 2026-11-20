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

export async function criarRefreshToken(usuarioId, familia = crypto.randomUUID()) {
  const token = crypto.randomBytes(48).toString('base64url');
  const expiraEm = new Date(Date.now() + config.REFRESH_TOKEN_DIAS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
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

  // Marca como usado só se ainda não foi (atômico: só uma requisição consegue)
  const { count } = await prisma.refreshToken.updateMany({
    where: { id: registro.id, revogadoEm: null },
    data: { revogadoEm: new Date() },
  });

  if (count === 0) {
    // O token já tinha sido usado. Foi há poucos segundos e a sessão segue ativa?
    const revogadoEm = registro.revogadoEm ?? new Date();
    const recente = Date.now() - revogadoEm.getTime() < TOLERANCIA_REUSO_MS;
    if (!(recente && (await familiaAtiva(registro.familia)))) {
      await revogarFamilia(registro.familia);
      console.warn(`[seguranca] reuso de refresh token detectado (usuario ${registro.usuarioId}); sessão revogada`);
      return null;
    }
  }

  const novo = await criarRefreshToken(registro.usuarioId, registro.familia);
  return { usuario: registro.usuario, ...novo };
}

export async function revogarFamilia(familia) {
  await prisma.refreshToken.updateMany({
    where: { familia, revogadoEm: null },
    data: { revogadoEm: new Date() },
  });
}

export async function revogarPorToken(tokenRecebido) {
  if (typeof tokenRecebido !== 'string' || tokenRecebido.length > 200) return;
  const registro = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(tokenRecebido) },
  });
  if (registro) await revogarFamilia(registro.familia);
}
