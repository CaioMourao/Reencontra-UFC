import { Router } from 'express';
import { z } from 'zod';
import { config } from './config.js';
import { prisma } from './db.js';
import { conferirSenha, HASH_FALSO } from './senhas.js';
import {
  criarRefreshToken,
  emitirAccessToken,
  revogarPorToken,
  rotacionarRefreshToken,
} from './tokens.js';
import { exigirAutenticacao, limiteGeral, limiteLogin } from './middlewares.js';

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
