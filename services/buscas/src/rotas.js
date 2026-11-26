import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { randomUUID } from 'node:crypto';
import { criarMiddlewareAuth } from '../../../shared/auth-grpc-middleware.js';
import { config } from './config.js';
import { ErroHttp } from './erros.js';
import { extrairTermos, normalizarTexto } from './compatibilidade.js';
import {
  criarBuscaSchema,
  dataAtualUtc,
  filtrosBuscasSchema,
  normalizarCategoria,
  normalizarPalavrasBusca,
  paraDataUtc,
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
  message: { erro: 'Limite de buscas criadas atingido. Tente novamente mais tarde.' },
});

const limiteAtualizacao = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { erro: 'Limite de alterações atingido. Tente novamente mais tarde.' },
});

function paraDto(busca) {
  return {
    id: busca.id,
    categoria: busca.categoria,
    palavrasChave: busca.palavrasChave,
    localPerdido: busca.localPerdido,
    dataInicio: busca.dataInicio?.toISOString().slice(0, 10) ?? null,
    dataFim: busca.dataFim?.toISOString().slice(0, 10) ?? null,
    status: busca.status,
    criadoEm: busca.criadoEm,
    atualizadoEm: busca.atualizadoEm,
    arquivadaEm: busca.arquivadaEm,
  };
}

function termosFiltro(valor) {
  return normalizarTexto(valor).split(' ').filter((termo) => termo.length >= 2);
}

function dadosBusca(dados, usuarioId) {
  const palavrasChave = normalizarPalavrasBusca(dados.palavrasChave);
  return {
    usuarioId,
    categoria: dados.categoria,
    categoriaNormalizada: normalizarCategoria(dados.categoria),
    palavrasChave,
    palavrasNormalizadas: [...new Set(palavrasChave.flatMap(extrairTermos))],
    localPerdido: dados.localPerdido,
    dataInicio: paraDataUtc(dados.dataInicio),
    dataFim: paraDataUtc(dados.dataFim),
  };
}

export function criarRotasBuscas(prisma) {
  const rotas = Router();
  rotas.use(limiteGeral, exigirAutenticacao);

  rotas.get('/', async (req, res) => {
    const filtros = filtrosBuscasSchema.parse(req.query);
    const where = { usuarioId: req.usuario.id };

    if (filtros.status !== 'TODAS') where.status = filtros.status;
    if (filtros.categoria) {
      where.categoriaNormalizada = { contains: normalizarCategoria(filtros.categoria) };
    }
    const termos = termosFiltro(filtros.q);
    if (termos.length > 0) {
      where.OR = [
        { categoriaNormalizada: { contains: normalizarCategoria(filtros.q) } },
        { palavrasNormalizadas: { hasSome: termos } },
      ];
    }

    const pular = (filtros.pagina - 1) * filtros.porPagina;
    const [total, buscas] = await prisma.$transaction([
      prisma.busca.count({ where }),
      prisma.busca.findMany({
        where,
        orderBy: [{ atualizadoEm: 'desc' }, { criadoEm: 'desc' }],
        skip: pular,
        take: filtros.porPagina,
      }),
    ]);

    res.json({
      itens: buscas.map(paraDto),
      pagina: filtros.pagina,
      porPagina: filtros.porPagina,
      total,
      temProxima: pular + buscas.length < total,
    });
  });

  rotas.post('/', limiteCriacao, async (req, res) => {
    const dados = criarBuscaSchema.parse(req.body);
    if (dados.dataFim && dados.dataFim > dataAtualUtc()) {
      throw new ErroHttp(400, 'O período da busca não pode terminar no futuro.');
    }

    const busca = await prisma.$transaction(async (tx) => {
      const criada = await tx.busca.create({
        data: { id: randomUUID(), ...dadosBusca(dados, req.usuario.id) },
      });
      await tx.outboxEvento.create({
        data: {
          id: randomUUID(),
          tipo: 'busca.criada',
          payload: { buscaId: criada.id },
        },
      });
      return criada;
    });
    res.status(201).json({ busca: paraDto(busca) });
  });

  rotas.get('/:id', async (req, res) => {
    const id = validarId(req.params.id);
    const busca = await prisma.busca.findFirst({
      where: { id, usuarioId: req.usuario.id },
    });
    if (!busca) throw new ErroHttp(404, 'Busca não encontrada.');
    res.json({ busca: paraDto(busca) });
  });

  rotas.patch('/:id', limiteAtualizacao, async (req, res) => {
    const id = validarId(req.params.id);
    const dados = criarBuscaSchema.parse(req.body);
    if (dados.dataFim && dados.dataFim > dataAtualUtc()) {
      throw new ErroHttp(400, 'O período da busca não pode terminar no futuro.');
    }

    const existente = await prisma.busca.findFirst({
      where: { id, usuarioId: req.usuario.id },
    });
    if (!existente) throw new ErroHttp(404, 'Busca não encontrada.');
    if (existente.status !== 'ATIVA') throw new ErroHttp(409, 'Uma busca arquivada não pode ser editada.');

    const atualizada = await prisma.$transaction(async (tx) => {
      const alteracao = await tx.busca.updateMany({
        where: { id, usuarioId: req.usuario.id, status: 'ATIVA' },
        data: dadosBusca(dados, req.usuario.id),
      });
      if (alteracao.count === 0) throw new ErroHttp(409, 'A busca foi alterada. Atualize a lista e tente novamente.');

      const modificada = await tx.busca.findUnique({ where: { id } });
      await tx.outboxEvento.create({
        data: {
          id: randomUUID(),
          tipo: 'busca.atualizada',
          payload: { buscaId: modificada.id },
        },
      });
      return modificada;
    });
    res.json({ busca: paraDto(atualizada) });
  });

  rotas.post('/:id/arquivar', limiteAtualizacao, async (req, res) => {
    const id = validarId(req.params.id);
    const alteracao = await prisma.busca.updateMany({
      where: { id, usuarioId: req.usuario.id, status: 'ATIVA' },
      data: { status: 'ARQUIVADA', arquivadaEm: new Date() },
    });
    if (alteracao.count === 0) {
      const existe = await prisma.busca.findFirst({ where: { id, usuarioId: req.usuario.id } });
      if (!existe) throw new ErroHttp(404, 'Busca não encontrada.');
      throw new ErroHttp(409, 'Esta busca já foi arquivada.');
    }
    const busca = await prisma.busca.findUnique({ where: { id } });
    res.json({ busca: paraDto(busca) });
  });

  rotas.post('/:id/desarquivar', limiteAtualizacao, async (req, res) => {
    const id = validarId(req.params.id);
    const alteracao = await prisma.busca.updateMany({
      where: { id, usuarioId: req.usuario.id, status: 'ARQUIVADA' },
      data: { status: 'ATIVA', arquivadaEm: null },
    });
    if (alteracao.count === 0) {
      const existe = await prisma.busca.findFirst({ where: { id, usuarioId: req.usuario.id } });
      if (!existe) throw new ErroHttp(404, 'Busca não encontrada.');
      throw new ErroHttp(409, 'Esta busca já está ativa.');
    }
    const busca = await prisma.busca.findUnique({ where: { id } });
    res.json({ busca: paraDto(busca) });
  });

  return rotas;
}
