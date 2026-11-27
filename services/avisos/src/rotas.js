import { Router } from 'express';
import { z } from 'zod';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { criarMiddlewareAuth } from '../../../shared/auth-grpc-middleware.js';
import { config } from './config.js';
import { ErroHttp } from './erros.js';

const exigirAutenticacao = criarMiddlewareAuth({
  endereco: config.AUTH_GRPC_URL,
  protoPath: config.AUTH_PROTO_PATH,
  grpc,
  protoLoader,
});

const filtrosSchema = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(50).default(20),
  naoLidos: z.enum(['true', 'false']).optional(),
});

function paraDto(aviso) {
  return {
    id: aviso.id,
    tipo: aviso.tipo,
    correspondenciaId: aviso.correspondenciaId,
    solicitacaoContatoId: aviso.solicitacaoContatoId,
    publicacaoId: aviso.publicacaoId,
    buscaId: aviso.buscaId,
    referencia: aviso.referencia,
    categoria: aviso.categoria,
    palavrasEmComum: aviso.palavrasEmComum,
    localPerdido: aviso.localPerdido,
    motivo: aviso.motivo,
    ocorridoEm: aviso.ocorridoEm,
    criadoEm: aviso.criadoEm,
    lidoEm: aviso.lidoEm,
  };
}

export function criarRotasAvisos(prisma) {
  const rotas = Router();
  rotas.use(exigirAutenticacao);

  rotas.get('/resumo', async (req, res) => {
    const naoLidos = await prisma.aviso.count({ where: { usuarioId: req.usuario.id, lidoEm: null } });
    res.json({ naoLidos });
  });

  rotas.get('/', async (req, res) => {
    const filtros = filtrosSchema.parse(req.query);
    const where = { usuarioId: req.usuario.id };
    if (filtros.naoLidos === 'true') where.lidoEm = null;
    if (filtros.naoLidos === 'false') where.lidoEm = { not: null };
    const pular = (filtros.pagina - 1) * filtros.porPagina;
    const [total, naoLidos, avisos] = await prisma.$transaction([
      prisma.aviso.count({ where }),
      prisma.aviso.count({ where: { usuarioId: req.usuario.id, lidoEm: null } }),
      prisma.aviso.findMany({
        where,
        orderBy: [{ criadoEm: 'desc' }, { id: 'desc' }],
        skip: pular,
        take: filtros.porPagina,
      }),
    ]);
    res.json({
      itens: avisos.map(paraDto),
      pagina: filtros.pagina,
      porPagina: filtros.porPagina,
      total,
      naoLidos,
      temProxima: pular + avisos.length < total,
    });
  });

  rotas.patch('/lidas', async (req, res) => {
    const resultado = await prisma.aviso.updateMany({
      where: { usuarioId: req.usuario.id, lidoEm: null },
      data: { lidoEm: new Date() },
    });
    res.json({ atualizados: resultado.count, naoLidos: 0 });
  });

  rotas.patch('/:id/lida', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const alteracao = await prisma.aviso.updateMany({
      where: { id, usuarioId: req.usuario.id, lidoEm: null },
      data: { lidoEm: new Date() },
    });
    if (alteracao.count === 0) {
      const aviso = await prisma.aviso.findFirst({ where: { id, usuarioId: req.usuario.id } });
      if (!aviso) throw new ErroHttp(404, 'Aviso não encontrado.');
      return res.json({ aviso: paraDto(aviso), jaLido: true });
    }
    const aviso = await prisma.aviso.findFirst({ where: { id, usuarioId: req.usuario.id } });
    res.json({ aviso: paraDto(aviso), jaLido: false });
  });

  return rotas;
}
