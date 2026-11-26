import { Router } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { config } from './config.js';
import { prisma } from './db.js';
import { conferirSenha, gerarHashSenha, HASH_FALSO } from './senhas.js';
import { enviarEmailRecuperacao } from './email.js';
import {
  criarRefreshToken,
  emitirAccessToken,
  revogarPorToken,
  rotacionarRefreshToken,
} from './tokens.js';
import {
  exigirAutenticacao,
  limiteCadastro,
  limiteGeral,
  limiteLogin,
  limiteRedefinirSenha,
  limiteSolicitarRecuperacao,
} from './middlewares.js';

export const rotas = Router();

const COOKIE_REFRESH = 'reencontra_refresh';

// httpOnly: JavaScript da página não lê o cookie (protege contra XSS).
// sameSite strict: o navegador não manda o cookie em requisições vindas de
// outros sites (protege contra CSRF). path restrito: o cookie só vai para
// as rotas que precisam dele.
function opcoesCookie(expiraEm) {
  return {
    httpOnly: true,
    secure: config.emProducao,
    sameSite: 'strict',
    path: config.COOKIE_PATH,
    ...(expiraEm ? { expires: expiraEm } : {}),
  };
}

function respostaSessao(res, usuario, refresh) {
  res.cookie(COOKIE_REFRESH, refresh.token, opcoesCookie(refresh.expiraEm));
  res.set('Cache-Control', 'no-store');
  return res.json({
    accessToken: emitirAccessToken(usuario),
    tipo: 'Bearer',
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email },
  });
}

const esquemaLogin = z.object({
  email: z.email().max(254).transform((e) => e.trim().toLowerCase()),
  senha: z.string().min(1).max(128),
});

const ERRO_CREDENCIAIS = { erro: 'E-mail ou senha inválidos.' };

rotas.post('/login', limiteLogin, async (req, res) => {
  const dados = esquemaLogin.safeParse(req.body);
  if (!dados.success) {
    // Mesma mensagem de credencial errada: não ajuda quem está testando e-mails
    return res.status(401).json(ERRO_CREDENCIAIS);
  }
  const { email, senha } = dados.data;

  const usuario = await prisma.usuario.findUnique({ where: { email } });

  if (usuario?.bloqueadoAte && usuario.bloqueadoAte > new Date()) {
    // Ainda gasta o tempo do bcrypt para a resposta não ficar mais rápida
    await conferirSenha(senha, HASH_FALSO);
    return res
      .status(429)
      .json({ erro: 'Muitas tentativas de login. Tente novamente em alguns minutos.' });
  }

  const senhaOk = await conferirSenha(senha, usuario?.senhaHash ?? HASH_FALSO);

  if (!usuario || !senhaOk) {
    if (usuario) {
      // Incremento atômico no banco. Ler o valor e gravar +1 (como antes)
      // perdia contagens: 10 senhas erradas em paralelo viravam 1 tentativa
      // e a conta nunca era bloqueada.
      const { tentativasFalhas } = await prisma.usuario.update({
        where: { id: usuario.id },
        data: { tentativasFalhas: { increment: 1 } },
        select: { tentativasFalhas: true },
      });
      if (tentativasFalhas >= config.login.maxTentativasPorConta) {
        await prisma.usuario.update({
          where: { id: usuario.id },
          data: {
            tentativasFalhas: 0,
            bloqueadoAte: new Date(Date.now() + config.login.bloqueioMinutos * 60 * 1000),
          },
        });
        console.warn(`[seguranca] conta ${usuario.id} bloqueada por excesso de tentativas`);
      }
    }
    return res.status(401).json(ERRO_CREDENCIAIS);
  }

  if (usuario.tentativasFalhas > 0 || usuario.bloqueadoAte) {
    await prisma.usuario.update({
      where: { id: usuario.id },
      data: { tentativasFalhas: 0, bloqueadoAte: null },
    });
  }

  const refresh = await criarRefreshToken(usuario.id);
  return respostaSessao(res, usuario, refresh);
});

const esquemaCadastro = z.object({
  nome: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254).transform((e) => e.toLowerCase()),
  senha: z.string().min(8).max(128)
    .refine((s) => /[A-Za-zÀ-ÿ]/.test(s) && /\d/.test(s), 'A senha precisa ter pelo menos uma letra e um número.'),
});

rotas.post('/cadastro', limiteCadastro, async (req, res) => {
  const dados = esquemaCadastro.safeParse(req.body);
  if (!dados.success) {
    return res.status(400).json({ erro: 'Confira nome, e-mail e senha. A senha precisa ter de 8 a 128 caracteres, com pelo menos uma letra e um número.' });
  }
  const { nome, email, senha } = dados.data;
  const dominios = config.cadastro.dominiosPermitidos;
  if (dominios.length && !dominios.includes(email.split('@')[1])) {
    return res.status(400).json({ erro: 'Use um e-mail de um domínio permitido.' });
  }
  try {
    const usuario = await prisma.usuario.create({
      data: { nome, email, senhaHash: await gerarHashSenha(senha) },
    });
    const refresh = await criarRefreshToken(usuario.id);
    return respostaSessao(res, usuario, refresh);
  } catch (erro) {
    if (erro.code === 'P2002') return res.status(409).json({ erro: 'E-mail já cadastrado.' });
    console.error('[erro] cadastro não concluído'); return res.status(500).json({ erro: 'Erro interno.' });
  }
});

const esquemaRecuperacao = z.object({
  email: z.string().trim().email().max(254).transform((e) => e.toLowerCase()),
});
const esquemaRedefinicao = z.object({
  token: z.string().min(32).max(128),
  senha: z.string().min(8).max(128)
    .refine((s) => /[A-Za-zÀ-ÿ]/.test(s) && /\d/.test(s), 'A senha precisa ter pelo menos uma letra e um número.'),
});
const MENSAGEM_RECUPERACAO = 'Se o e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.';

rotas.post('/recuperar-senha', limiteSolicitarRecuperacao, async (req, res) => {
  const dados = esquemaRecuperacao.safeParse(req.body);
  if (!dados.success) return res.status(400).json({ erro: 'Digite um e-mail válido.' });
  if (!config.email.resendApiKey || !config.email.remetente) {
    return res.status(503).json({ erro: 'A recuperação de senha ainda não está configurada para envio de e-mails.' });
  }

  const usuario = await prisma.usuario.findUnique({ where: { email: dados.data.email } });
  if (usuario) {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const expiraEm = new Date(Date.now() + 30 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.tokenRecuperacao.deleteMany({ where: { usuarioId: usuario.id } });
      await tx.tokenRecuperacao.create({
        data: { tokenHash, usuarioId: usuario.id, expiraEm },
      });
    });

    const url = new URL('/redefinir-senha', config.email.baseUrl);
    // O fragmento não é enviado ao servidor web nem aparece em logs HTTP.
    url.hash = new URLSearchParams({ token }).toString();
    try {
      await enviarEmailRecuperacao({ para: usuario.email, link: url.toString() });
    } catch {
      // Não registrar endereço, token, corpo da mensagem ou detalhe do provedor.
      console.error('[email] não foi possível enviar o link de recuperação');
      await prisma.tokenRecuperacao.deleteMany({ where: { tokenHash } });
    }
  }

  res.set('Cache-Control', 'no-store');
  return res.status(202).json({ mensagem: MENSAGEM_RECUPERACAO });
});

rotas.post('/redefinir-senha', limiteRedefinirSenha, async (req, res) => {
  const dados = esquemaRedefinicao.safeParse(req.body);
  if (!dados.success) {
    return res.status(400).json({ erro: 'Link inválido ou expirado, ou senha fora dos requisitos.' });
  }

  const tokenHash = createHash('sha256').update(dados.data.token).digest('hex');
  const senhaHash = await gerarHashSenha(dados.data.senha);
  const agora = new Date();

  const redefinida = await prisma.$transaction(async (tx) => {
    const token = await tx.tokenRecuperacao.findUnique({ where: { tokenHash } });
    if (!token || token.usadoEm || token.expiraEm <= agora) return false;

    const marcada = await tx.tokenRecuperacao.updateMany({
      where: { id: token.id, usadoEm: null, expiraEm: { gt: agora } },
      data: { usadoEm: agora },
    });
    if (marcada.count !== 1) return false;

    await tx.usuario.update({
      where: { id: token.usuarioId },
      data: { senhaHash, tentativasFalhas: 0, bloqueadoAte: null },
    });
    await tx.refreshToken.updateMany({
      where: { usuarioId: token.usuarioId, revogadoEm: null },
      data: { revogadoEm: agora },
    });
    await tx.tokenRecuperacao.deleteMany({
      where: { usuarioId: token.usuarioId, id: { not: token.id } },
    });
    return true;
  });

  if (!redefinida) {
    return res.status(400).json({ erro: 'Link inválido ou expirado. Solicite uma nova recuperação.' });
  }

  res.set('Cache-Control', 'no-store');
  return res.json({ mensagem: 'Senha atualizada. Entre com a nova senha.' });
});
// Gera um novo access token a partir do cookie de refresh.
// O front chama isso ao abrir a página e quando o access token expira.
rotas.post('/refresh', limiteGeral, async (req, res) => {
  const resultado = await rotacionarRefreshToken(req.cookies?.[COOKIE_REFRESH]);
  if (!resultado) {
    res.clearCookie(COOKIE_REFRESH, opcoesCookie());
    return res.status(401).json({ erro: 'Sessão expirada. Faça login novamente.' });
  }
  return respostaSessao(res, resultado.usuario, resultado);
});

rotas.post('/logout', limiteGeral, async (req, res) => {
  await revogarPorToken(req.cookies?.[COOKIE_REFRESH]);
  res.clearCookie(COOKIE_REFRESH, opcoesCookie());
  res.status(204).end();
});

// Rota protegida de exemplo: devolve quem está logado.
rotas.get('/me', limiteGeral, exigirAutenticacao, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ usuario: req.usuario });
});
