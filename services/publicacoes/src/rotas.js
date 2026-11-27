import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { criarMiddlewareAuth } from '../../../shared/auth-grpc-middleware.js';
import { config } from './config.js';
import { ErroHttp } from './erros.js';
import { caminhoImagem, excluirImagem, receberImagem, salvarImagem } from './imagens.js';
import { hashCodigoRetirada, criarCodigoRetirada, criarReferencia } from './codigos.js';
import { publicarPublicacao } from './publicacao-dto.js';
import {
  adicionarDiasUtc,
  atualizarPublicacaoSchema,
  confirmarDevolucaoSchema,
  criarPublicacaoSchema,
  filtrosPublicacoesSchema,
  paraDataUtc,
  solicitarContatoSchema,
  validarDataEncontrado,
  validarId,
} from './validacao.js';

const exigirAutenticacao = criarMiddlewareAuth({
  endereco: config.AUTH_GRPC_URL,
  protoPath: config.AUTH_PROTO_PATH,
  grpc,
  protoLoader,
});

const limiteGeral = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Muitas requisições. Aguarde um pouco.' },
});

const limiteCriacao = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Limite de publicações atingido. Tente novamente mais tarde.' },
});

const limiteAtualizacao = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Limite de alterações atingido. Tente novamente mais tarde.' },
});

const limiteContato = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Muitas solicitações de contato. Tente novamente mais tarde.' },
});

const limiteCodigo = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Muitas tentativas de confirmação. Aguarde antes de tentar novamente.' },
});

const limiteRenovarCodigo = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Você gerou muitos códigos. Tente novamente mais tarde.' },
});

const limiteMensagens = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Você enviou muitas mensagens. Aguarde um pouco.' },
});

const mensagemContatoSchema = z.object({
  texto: z.string().trim().min(1).max(2000),
});

function criarEvento(tipo, payload) {
  return { id: randomUUID(), tipo, payload, criadoEm: new Date() };
}

function participanteDaSolicitacao(solicitacao, usuarioId) {
  return solicitacao.solicitanteId === usuarioId || solicitacao.publicacao.usuarioId === usuarioId;
}

function paraMensagemDto(mensagem, usuarioId) {
  return {
    id: mensagem.id,
    texto: mensagem.texto,
    criadoEm: mensagem.criadoEm,
    lidoEm: mensagem.lidoEm,
    souRemetente: mensagem.remetenteId === usuarioId,
  };
}

async function bloquearPublicacao(tx, id) {
  await tx.$queryRaw`SELECT id FROM publicacoes WHERE id = ${id}::uuid FOR UPDATE`;
  return tx.publicacao.findUnique({ where: { id } });
}

function criarRotas(prisma) {
  const rotas = Router();
  rotas.use(limiteGeral, exigirAutenticacao);

  rotas.get('/', async (req, res) => {
    const filtros = filtrosPublicacoesSchema.parse(req.query);
    const minhas = filtros.minhas === 'true';
    const where = {};

    if (minhas) where.usuarioId = req.usuario.id;
    if (filtros.status) where.status = filtros.status;
    else if (!minhas) where.status = 'ABERTA';
    if (filtros.categoria) where.categoria = { contains: filtros.categoria, mode: 'insensitive' };

    if (filtros.de || filtros.ate) {
      where.dataEncontrado = {};
      if (filtros.de) where.dataEncontrado.gte = paraDataUtc(filtros.de);
      if (filtros.ate) where.dataEncontrado.lt = adicionarDiasUtc(paraDataUtc(filtros.ate), 1);
    }

    if (filtros.q) {
      where.OR = [
        { categoria: { contains: filtros.q, mode: 'insensitive' } },
        { descricao: { contains: filtros.q, mode: 'insensitive' } },
        { localAproximado: { contains: filtros.q, mode: 'insensitive' } },
      ];
    }

    const skip = (filtros.pagina - 1) * filtros.porPagina;
    const [total, publicacoes] = await prisma.$transaction([
      prisma.publicacao.count({ where }),
      prisma.publicacao.findMany({
        where,
        orderBy: [{ dataEncontrado: 'desc' }, { criadoEm: 'desc' }],
        skip,
        take: filtros.porPagina,
      }),
    ]);

    const solicitacoesAtivas = minhas || publicacoes.length === 0
      ? []
      : await prisma.solicitacaoContato.findMany({
        where: {
          publicacaoId: { in: publicacoes.map(({ id }) => id) },
          solicitanteId: req.usuario.id,
          status: 'PENDENTE',
        },
        select: { id: true, publicacaoId: true },
      });
    const solicitacaoPorPublicacao = new Map(solicitacoesAtivas.map((item) => [item.publicacaoId, item.id]));

    res.json({
      itens: publicacoes.map((publicacao) => ({
        ...publicarPublicacao(publicacao, req.usuario.id),
        solicitacaoId: solicitacaoPorPublicacao.get(publicacao.id) ?? null,
      })),
      pagina: filtros.pagina,
      porPagina: filtros.porPagina,
      total,
      temProxima: skip + publicacoes.length < total,
    });
  });

  rotas.post('/', limiteCriacao, receberImagem.single('imagem'), async (req, res) => {
    if (!req.file) throw new ErroHttp(400, 'A foto do objeto é obrigatória.');
    const dados = criarPublicacaoSchema.parse(req.body);
    const dataEncontrado = paraDataUtc(dados.dataEncontrado);
    validarDataEncontrado(dataEncontrado);

    const imagem = await salvarImagem(req.file);
    try {
      let publicacao;
      for (let tentativa = 0; tentativa < 5; tentativa += 1) {
        const id = randomUUID();
        const referencia = criarReferencia();
        try {
          publicacao = await prisma.$transaction(async (tx) => {
            const criada = await tx.publicacao.create({
              data: {
                id,
                referencia,
                usuarioId: req.usuario.id,
                categoria: dados.categoria,
                descricao: dados.descricao,
                localAproximado: dados.localAproximado,
                dataEncontrado,
                ...(imagem ? { imagemArquivo: imagem.arquivo, imagemMime: imagem.mime } : {}),
              },
            });
            await tx.outboxEvento.create({
              data: {
                ...criarEvento('publicacao.criada', {
                  publicacaoId: criada.id,
                  referencia: criada.referencia,
                  usuarioId: criada.usuarioId,
                }),
              },
            });
            return criada;
          });
          break;
        } catch (erro) {
          if (erro.code !== 'P2002' || tentativa === 4) throw erro;
        }
      }
      res.status(201).json({ publicacao: publicarPublicacao(publicacao, req.usuario.id) });
    } catch (erro) {
      if (imagem) await excluirImagem(imagem.arquivo).catch(() => {});
      throw erro;
    }
  });

  rotas.get('/contatos', async (req, res) => {
    const solicitacoes = await prisma.solicitacaoContato.findMany({
      where: {
        OR: [
          { solicitanteId: req.usuario.id },
          { publicacao: { is: { usuarioId: req.usuario.id } } },
        ],
      },
      select: {
        id: true,
        solicitanteId: true,
        status: true,
        criadoEm: true,
        codigoExpiraEm: true,
        publicacao: {
          select: { id: true, referencia: true, categoria: true, usuarioId: true, status: true },
        },
        mensagens: {
          orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
          take: 1,
          select: { texto: true, criadoEm: true },
        },
      },
    });

    const ids = solicitacoes.map(({ id }) => id);
    const naoLidas = ids.length === 0 ? [] : await prisma.mensagemContato.groupBy({
      by: ['solicitacaoId'],
      where: { solicitacaoId: { in: ids }, remetenteId: { not: req.usuario.id }, lidoEm: null },
      _count: { _all: true },
    });
    const contagemNaoLidas = new Map(naoLidas.map((item) => [item.solicitacaoId, item._count._all]));
    const itens = solicitacoes.map((solicitacao) => {
      const souAutor = solicitacao.publicacao.usuarioId === req.usuario.id;
      const ultima = solicitacao.mensagens[0];
      return {
        id: solicitacao.id,
        referencia: solicitacao.publicacao.referencia,
        categoria: solicitacao.publicacao.categoria,
        status: solicitacao.status,
        publicacaoStatus: solicitacao.publicacao.status,
        criadoEm: solicitacao.criadoEm,
        souAutor,
        souSolicitante: !souAutor,
        podeRenovarCodigo: !souAutor && solicitacao.status === 'PENDENTE' && solicitacao.publicacao.status === 'ABERTA',
        codigoExpiraEm: solicitacao.codigoExpiraEm,
        outraPessoa: souAutor ? 'Pessoa interessada' : 'Autor do anúncio',
        podeEnviar: solicitacao.status === 'PENDENTE' && solicitacao.publicacao.status === 'ABERTA',
        ultimaMensagem: ultima ? { texto: ultima.texto, criadoEm: ultima.criadoEm } : null,
        naoLidas: contagemNaoLidas.get(solicitacao.id) ?? 0,
      };
    }).sort((a, b) => new Date(b.ultimaMensagem?.criadoEm ?? b.criadoEm) - new Date(a.ultimaMensagem?.criadoEm ?? a.criadoEm));

    res.json({ itens, naoLidas: itens.reduce((total, item) => total + item.naoLidas, 0) });
  });

  rotas.get('/contatos/:solicitacaoId/mensagens', async (req, res) => {
    const solicitacaoId = validarId(req.params.solicitacaoId);
    const solicitacao = await prisma.solicitacaoContato.findUnique({
      where: { id: solicitacaoId },
      include: { publicacao: { select: { usuarioId: true } } },
    });
    if (!solicitacao || !participanteDaSolicitacao(solicitacao, req.usuario.id)) {
      throw new ErroHttp(404, 'Conversa não encontrada.');
    }

    await prisma.mensagemContato.updateMany({
      where: { solicitacaoId, remetenteId: { not: req.usuario.id }, lidoEm: null },
      data: { lidoEm: new Date() },
    });
    const mensagens = await prisma.mensagemContato.findMany({
      where: { solicitacaoId },
      orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
      take: 100,
    });
    res.json({ itens: mensagens.reverse().map((mensagem) => paraMensagemDto(mensagem, req.usuario.id)) });
  });

  rotas.post('/contatos/:solicitacaoId/mensagens', limiteMensagens, async (req, res) => {
    const solicitacaoId = validarId(req.params.solicitacaoId);
    const { texto } = mensagemContatoSchema.parse(req.body ?? {});
    const resultado = await prisma.$transaction(async (tx) => {
      const previa = await tx.solicitacaoContato.findUnique({ where: { id: solicitacaoId }, select: { publicacaoId: true } });
      if (!previa) throw new ErroHttp(404, 'Conversa não encontrada.');

      await bloquearPublicacao(tx, previa.publicacaoId);
      const solicitacao = await tx.solicitacaoContato.findUnique({
        where: { id: solicitacaoId },
        include: { publicacao: { select: { id: true, usuarioId: true, referencia: true, status: true } } },
      });
      if (!solicitacao || !participanteDaSolicitacao(solicitacao, req.usuario.id)) {
        throw new ErroHttp(404, 'Conversa não encontrada.');
      }
      if (solicitacao.status !== 'PENDENTE' || solicitacao.publicacao.status !== 'ABERTA') {
        throw new ErroHttp(409, 'Esta conversa foi encerrada e não aceita novas mensagens.');
      }

      const mensagem = await tx.mensagemContato.create({
        data: { solicitacaoId, remetenteId: req.usuario.id, texto },
      });
      const destinatarioId = solicitacao.solicitanteId === req.usuario.id
        ? solicitacao.publicacao.usuarioId
        : solicitacao.solicitanteId;
      await tx.outboxEvento.create({
        data: {
          ...criarEvento('contato.mensagem_enviada', {
            mensagemId: mensagem.id,
            solicitacaoId,
            publicacaoId: solicitacao.publicacao.id,
            referencia: solicitacao.publicacao.referencia,
            destinatarioId,
          }),
        },
      });
      return mensagem;
    });

    res.status(201).json({ mensagem: paraMensagemDto(resultado, req.usuario.id) });
  });

  rotas.post('/contatos/:solicitacaoId/codigo-retirada', limiteRenovarCodigo, async (req, res) => {
    const solicitacaoId = validarId(req.params.solicitacaoId);
    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + 24 * 60 * 60 * 1000);
    const resultado = await prisma.$transaction(async (tx) => {
      const previa = await tx.solicitacaoContato.findUnique({
        where: { id: solicitacaoId },
        select: { publicacaoId: true },
      });
      if (!previa) throw new ErroHttp(404, 'Conversa não encontrada.');

      await bloquearPublicacao(tx, previa.publicacaoId);
      const solicitacao = await tx.solicitacaoContato.findUnique({
        where: { id: solicitacaoId },
        include: {
          publicacao: {
            select: { id: true, usuarioId: true, referencia: true, categoria: true, status: true },
          },
        },
      });
      if (!solicitacao || !participanteDaSolicitacao(solicitacao, req.usuario.id)) {
        throw new ErroHttp(404, 'Conversa não encontrada.');
      }
      if (solicitacao.solicitanteId !== req.usuario.id) {
        throw new ErroHttp(403, 'Só a pessoa solicitante pode gerar outro código.');
      }
      if (solicitacao.status !== 'PENDENTE' || solicitacao.publicacao.status !== 'ABERTA') {
        throw new ErroHttp(409, 'Esta solicitação foi encerrada e não aceita um novo código.');
      }

      let codigoRetirada;
      let codigoHash;
      for (let tentativa = 0; tentativa < 5; tentativa += 1) {
        codigoRetirada = criarCodigoRetirada();
        codigoHash = hashCodigoRetirada(codigoRetirada);
        const colisao = await tx.solicitacaoContato.findUnique({
          where: {
            publicacaoId_codigoHash: {
              publicacaoId: solicitacao.publicacao.id,
              codigoHash,
            },
          },
          select: { id: true },
        });
        if (!colisao) break;
        codigoRetirada = undefined;
      }
      if (!codigoRetirada) throw new ErroHttp(503, 'Não foi possível gerar um código agora. Tente novamente.');

      await tx.solicitacaoContato.update({
        where: { id: solicitacaoId },
        data: { codigoHash, codigoExpiraEm: expiraEm },
      });
      await tx.outboxEvento.create({
        data: {
          ...criarEvento('contato.codigo_retirada_renovado', {
            solicitacaoId,
            publicacaoId: solicitacao.publicacao.id,
            referencia: solicitacao.publicacao.referencia,
            categoria: solicitacao.publicacao.categoria,
            solicitanteId: solicitacao.solicitanteId,
            donoId: solicitacao.publicacao.usuarioId,
          }),
        },
      });
      return { codigoRetirada, codigoExpiraEm: expiraEm };
    });

    res.set('Cache-Control', 'no-store');
    res.json({ ...resultado, aviso: 'O código anterior foi invalidado. Guarde este novo código.' });
  });

  rotas.get('/:id/contatos', async (req, res) => {
    const id = validarId(req.params.id);
    const publicacao = await prisma.publicacao.findUnique({ where: { id } });
    if (!publicacao) throw new ErroHttp(404, 'Publicação não encontrada.');
    if (publicacao.usuarioId !== req.usuario.id) throw new ErroHttp(403, 'Só o autor pode consultar as solicitações deste anúncio.');

    const solicitacoes = await prisma.solicitacaoContato.findMany({
      where: { publicacaoId: id, status: 'PENDENTE', codigoExpiraEm: { gt: new Date() } },
      orderBy: { criadoEm: 'asc' },
      select: { id: true, criadoEm: true, codigoExpiraEm: true },
    });
    res.json({ itens: solicitacoes });
  });

  rotas.get('/:id', async (req, res) => {
    const id = validarId(req.params.id);
    const publicacao = await prisma.publicacao.findUnique({ where: { id } });
    if (!publicacao || (publicacao.status !== 'ABERTA' && publicacao.usuarioId !== req.usuario.id)) {
      throw new ErroHttp(404, 'Publicação não encontrada.');
    }
    res.json({ publicacao: publicarPublicacao(publicacao, req.usuario.id) });
  });

  rotas.get('/:id/imagem', async (req, res) => {
    const id = validarId(req.params.id);
    const publicacao = await prisma.publicacao.findUnique({ where: { id } });
    if (!publicacao || (publicacao.status !== 'ABERTA' && publicacao.usuarioId !== req.usuario.id)) {
      throw new ErroHttp(404, 'Foto não encontrada.');
    }
    const caminho = caminhoImagem(publicacao.imagemArquivo);
    if (!caminho || !publicacao.imagemMime) throw new ErroHttp(404, 'Foto não encontrada.');

    let imagem;
    try {
      imagem = await readFile(caminho);
    } catch (erro) {
      if (erro.code === 'ENOENT') throw new ErroHttp(404, 'Foto não encontrada.');
      throw erro;
    }
    res.set('Cache-Control', 'private, max-age=3600, immutable');
    res.type(publicacao.imagemMime).send(imagem);
  });

  rotas.patch('/:id', limiteAtualizacao, receberImagem.single('imagem'), async (req, res) => {
    const id = validarId(req.params.id);
    const corpo = { ...(req.body ?? {}) };
    if (corpo.removerImagem !== undefined) throw new ErroHttp(400, 'Toda publicação precisa manter uma foto. Envie uma nova para substituir a atual.');

    const dados = atualizarPublicacaoSchema.parse(corpo);
    if (Object.keys(dados).length === 0 && !req.file) {
      throw new ErroHttp(400, 'Informe alguma alteração para salvar.');
    }
    if (dados.dataEncontrado) validarDataEncontrado(paraDataUtc(dados.dataEncontrado));

    const imagemNova = await salvarImagem(req.file);
    let arquivoAnterior = null;
    let publicacao;
    try {
      publicacao = await prisma.$transaction(async (tx) => {
        const atual = await bloquearPublicacao(tx, id);
        if (!atual) throw new ErroHttp(404, 'Publicação não encontrada.');
        if (atual.usuarioId !== req.usuario.id) throw new ErroHttp(403, 'Só o autor pode editar este anúncio.');
        if (atual.status !== 'ABERTA') throw new ErroHttp(409, 'Só anúncios abertos podem ser editados.');
        if (!imagemNova && !atual.imagemArquivo) throw new ErroHttp(400, 'Anexe uma foto antes de salvar esta publicação.');

        arquivoAnterior = atual.imagemArquivo;
        const alterada = await tx.publicacao.updateMany({
          where: { id, usuarioId: req.usuario.id, status: 'ABERTA' },
          data: {
            ...dados,
            ...(dados.dataEncontrado ? { dataEncontrado: paraDataUtc(dados.dataEncontrado) } : {}),
            ...(imagemNova ? { imagemArquivo: imagemNova.arquivo, imagemMime: imagemNova.mime } : {}),
          },
        });
        if (alterada.count !== 1) throw new ErroHttp(409, 'O anúncio mudou enquanto você o editava. Atualize a página.');
        await tx.outboxEvento.create({
          data: {
            ...criarEvento('publicacao.atualizada', {
              publicacaoId: atual.id,
              referencia: atual.referencia,
              usuarioId: atual.usuarioId,
            }),
          },
        });
        return tx.publicacao.findUnique({ where: { id } });
      });
    } catch (erro) {
      if (imagemNova) await excluirImagem(imagemNova.arquivo).catch(() => {});
      throw erro;
    }
    if (imagemNova && arquivoAnterior) {
      await excluirImagem(arquivoAnterior).catch(() => console.error('[publicacoes] não foi possível remover a foto substituída.'));
    }
    res.json({ publicacao: publicarPublicacao(publicacao, req.usuario.id) });
  });

  rotas.post('/:id/contatos', limiteContato, async (req, res) => {
    solicitarContatoSchema.parse(req.body ?? {});
    const id = validarId(req.params.id);
    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + 24 * 60 * 60 * 1000);

    const resultado = await prisma.$transaction(async (tx) => {
      const publicacao = await bloquearPublicacao(tx, id);
      if (!publicacao) throw new ErroHttp(404, 'Publicação não encontrada.');
      if (publicacao.usuarioId === req.usuario.id) throw new ErroHttp(409, 'Você não pode solicitar contato sobre seu próprio anúncio.');
      if (publicacao.status !== 'ABERTA') throw new ErroHttp(409, 'Este anúncio não está mais disponível.');

      const chave = { publicacaoId_solicitanteId: { publicacaoId: id, solicitanteId: req.usuario.id } };
      const existente = await tx.solicitacaoContato.findUnique({ where: chave });
      if (existente) {
        if (existente.status !== 'PENDENTE') throw new ErroHttp(409, 'Você já concluiu uma solicitação para este anúncio.');
        return { solicitacao: existente, codigoRetirada: null, jaExistia: true };
      }

      const codigoRetirada = criarCodigoRetirada();
      const codigoHash = hashCodigoRetirada(codigoRetirada);
      const solicitacao = await tx.solicitacaoContato.create({
        data: {
          id: randomUUID(),
          publicacaoId: id,
          solicitanteId: req.usuario.id,
          codigoHash,
          codigoExpiraEm: expiraEm,
        },
      });

      await tx.outboxEvento.create({
        data: {
          ...criarEvento('contato.solicitado', {
            solicitacaoId: solicitacao.id,
            publicacaoId: publicacao.id,
            referencia: publicacao.referencia,
            categoria: publicacao.categoria,
            solicitanteId: req.usuario.id,
            donoId: publicacao.usuarioId,
          }),
        },
      });
      return { solicitacao, codigoRetirada, jaExistia: false };
    });

    res.set('Cache-Control', 'no-store');
    res.status(resultado.jaExistia ? 200 : 201).json({
      solicitacao: { id: resultado.solicitacao.id, codigoExpiraEm: resultado.solicitacao.codigoExpiraEm },
      jaExistia: resultado.jaExistia,
      ...(resultado.codigoRetirada ? {
        codigoRetirada: resultado.codigoRetirada,
        aviso: 'O código é exibido somente agora. Se perdê-lo ou se expirar, gere outro pela conversa; o código anterior será invalidado.',
      } : {}),
    });
  });

  rotas.post('/:id/arquivar', async (req, res) => {
    const id = validarId(req.params.id);
    const publicacao = await prisma.$transaction(async (tx) => {
      const atual = await bloquearPublicacao(tx, id);
      if (!atual) throw new ErroHttp(404, 'Publicação não encontrada.');
      if (atual.usuarioId !== req.usuario.id) throw new ErroHttp(403, 'Só o autor pode arquivar este anúncio.');
      if (atual.status !== 'ABERTA') throw new ErroHttp(409, 'Este anúncio já foi encerrado.');

      const agora = new Date();
      const alterada = await tx.publicacao.updateMany({
        where: { id, usuarioId: req.usuario.id, status: 'ABERTA' },
        data: { status: 'ARQUIVADA', arquivadaEm: agora },
      });
      if (alterada.count !== 1) throw new ErroHttp(409, 'O anúncio mudou enquanto você tentava arquivá-lo. Atualize a página.');
      await tx.solicitacaoContato.updateMany({
        where: { publicacaoId: id, status: 'PENDENTE' },
        data: { status: 'CANCELADA' },
      });
      await tx.outboxEvento.create({
        data: {
          ...criarEvento('publicacao.arquivada', {
            publicacaoId: atual.id,
            referencia: atual.referencia,
            usuarioId: atual.usuarioId,
          }),
        },
      });
      return tx.publicacao.findUnique({ where: { id } });
    });
    res.json({ publicacao: publicarPublicacao(publicacao, req.usuario.id) });
  });

  rotas.post('/:id/desarquivar', limiteAtualizacao, async (req, res) => {
    const id = validarId(req.params.id);
    const publicacao = await prisma.$transaction(async (tx) => {
      const atual = await bloquearPublicacao(tx, id);
      if (!atual) throw new ErroHttp(404, 'Publicação não encontrada.');
      if (atual.usuarioId !== req.usuario.id) throw new ErroHttp(403, 'Só o autor pode desarquivar este anúncio.');
      if (atual.status !== 'ARQUIVADA') throw new ErroHttp(409, 'Somente anúncios arquivados podem ser desarquivados.');

      const alterada = await tx.publicacao.updateMany({
        where: { id, usuarioId: req.usuario.id, status: 'ARQUIVADA' },
        data: { status: 'ABERTA', arquivadaEm: null },
      });
      if (alterada.count !== 1) throw new ErroHttp(409, 'O anúncio mudou enquanto você tentava desarquivá-lo. Atualize a página.');

      await tx.outboxEvento.create({
        data: {
          ...criarEvento('publicacao.reaberta', {
            publicacaoId: atual.id,
            referencia: atual.referencia,
            usuarioId: atual.usuarioId,
          }),
        },
      });
      return tx.publicacao.findUnique({ where: { id } });
    });
    res.json({ publicacao: publicarPublicacao(publicacao, req.usuario.id) });
  });

  rotas.post('/:id/devolucao', limiteCodigo, async (req, res) => {
    const id = validarId(req.params.id);
    const { codigoRetirada } = confirmarDevolucaoSchema.parse(req.body);
    const codigoHash = hashCodigoRetirada(codigoRetirada);
    const agora = new Date();

    const publicacao = await prisma.$transaction(async (tx) => {
      const atual = await bloquearPublicacao(tx, id);
      if (!atual) throw new ErroHttp(404, 'Publicação não encontrada.');
      if (atual.usuarioId !== req.usuario.id) throw new ErroHttp(403, 'Só o autor pode confirmar a devolução.');
      if (atual.status !== 'ABERTA') throw new ErroHttp(409, 'Este anúncio já foi encerrado.');

      const solicitacao = await tx.solicitacaoContato.findFirst({
        where: {
          publicacaoId: id,
          codigoHash,
          status: 'PENDENTE',
          codigoExpiraEm: { gt: agora },
        },
      });
      if (!solicitacao) throw new ErroHttp(400, 'Código inválido ou expirado.');

      const alterada = await tx.publicacao.updateMany({
        where: { id, usuarioId: req.usuario.id, status: 'ABERTA' },
        data: { status: 'DEVOLVIDA', devolvidaEm: agora },
      });
      if (alterada.count !== 1) throw new ErroHttp(409, 'O anúncio mudou enquanto você confirmava a devolução.');

      await tx.solicitacaoContato.update({
        where: { id: solicitacao.id },
        data: { status: 'CONCLUIDA', concluidaEm: agora },
      });
      await tx.solicitacaoContato.updateMany({
        where: { publicacaoId: id, status: 'PENDENTE' },
        data: { status: 'CANCELADA' },
      });
      await tx.outboxEvento.create({
        data: {
          ...criarEvento('devolucao.concluida', {
            publicacaoId: atual.id,
            referencia: atual.referencia,
            donoId: atual.usuarioId,
            solicitanteId: solicitacao.solicitanteId,
          }),
        },
      });
      return tx.publicacao.findUnique({ where: { id } });
    });

    res.json({ publicacao: publicarPublicacao(publicacao, req.usuario.id) });
  });

  return rotas;
}

export function criarRotasPublicacoes(prisma) {
  return criarRotas(prisma);
}
