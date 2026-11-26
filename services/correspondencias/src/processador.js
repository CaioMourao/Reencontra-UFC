import { randomUUID } from 'node:crypto';
import grpc from '@grpc/grpc-js';
import { ehEventoDuplicado } from './erros.js';
import { prepararCorrespondencias } from './eventos.js';

async function reservarEvento(tx, evento) {
  const insercao = await tx.eventoProcessado.createMany({
    data: [{ id: evento.eventId, tipo: evento.eventType }],
    skipDuplicates: true,
  });
  return insercao.count === 1;
}

async function registrarEventoIgnorado(prisma, evento) {
  const insercao = await prisma.eventoProcessado.createMany({
    data: [{ id: evento.eventId, tipo: evento.eventType }],
    skipDuplicates: true,
  });
  return insercao.count === 0;
}

function dadosCorrespondencia(publicacao, correspondencia) {
  return {
    publicacaoId: publicacao.id,
    buscaId: correspondencia.buscaId,
    usuarioBuscaId: correspondencia.usuarioBuscaId,
    usuarioPublicacaoId: publicacao.usuario_id,
    referencia: publicacao.referencia,
    categoria: publicacao.categoria,
    palavrasEmComum: correspondencia.palavrasEmComum,
    localPerdido: correspondencia.localPerdido,
  };
}

async function enfileirarAviso(tx, id, publicacao, correspondencia) {
  await tx.outboxEvento.create({
    data: {
      id: randomUUID(),
      tipo: 'correspondencia.sugerida',
      payload: {
        correspondenciaId: id,
        usuarioId: correspondencia.usuarioBuscaId,
        publicacaoId: publicacao.id,
        buscaId: correspondencia.buscaId,
        referencia: publicacao.referencia,
        categoria: publicacao.categoria,
        palavrasEmComum: correspondencia.palavrasEmComum,
        localPerdido: correspondencia.localPerdido,
      },
    },
  });
}

async function atualizarEstadoPublicacao(prisma, evento, status) {
  return prisma.$transaction(async (tx) => {
    if (!(await reservarEvento(tx, evento))) return { duplicado: true };
    await tx.correspondencia.updateMany({
      where: { publicacaoId: evento.data.publicacaoId, status: { in: ['ATIVA', 'INCOMPATIVEL'] } },
      data: { status },
    });
    return { duplicado: false };
  });
}

async function reconciliarCorrespondencias(prisma, evento, publicacao, buscas) {
  const preparadas = prepararCorrespondencias(publicacao, buscas);
  return prisma.$transaction(async (tx) => {
    if (!(await reservarEvento(tx, evento))) return { duplicado: true, criadas: 0 };

    const idsBusca = preparadas.map(({ buscaId }) => buscaId);
    const existentes = idsBusca.length
      ? await tx.correspondencia.findMany({
        where: { publicacaoId: publicacao.id, buscaId: { in: idsBusca } },
      })
      : [];
    const porBusca = new Map(existentes.map((item) => [item.buscaId, item]));
    let criadas = 0;

    for (const correspondencia of preparadas) {
      const dados = dadosCorrespondencia(publicacao, correspondencia);
      const existente = porBusca.get(correspondencia.buscaId);
      if (!existente) {
        const nova = await tx.correspondencia.create({ data: dados });
        await enfileirarAviso(tx, nova.id, publicacao, correspondencia);
        criadas += 1;
      } else {
        await tx.correspondencia.update({
          where: { id: existente.id },
          data: { ...dados, status: 'ATIVA' },
        });
        if (existente.status !== 'ATIVA') {
          await enfileirarAviso(tx, existente.id, publicacao, correspondencia);
          criadas += 1;
        }
      }
    }

    await tx.correspondencia.updateMany({
      where: {
        publicacaoId: publicacao.id,
        status: 'ATIVA',
        ...(idsBusca.length ? { buscaId: { notIn: idsBusca } } : {}),
      },
      data: { status: 'INCOMPATIVEL' },
    });
    return { duplicado: false, criadas };
  });
}

export async function processarEventoPublicacao(prisma, clientes, evento) {
  if (await prisma.eventoProcessado.findUnique({ where: { id: evento.eventId }, select: { id: true } })) {
    return { duplicado: true, criadas: 0 };
  }

  if (evento.eventType === 'publicacao.arquivada') {
    return atualizarEstadoPublicacao(prisma, evento, 'ARQUIVADA');
  }
  if (evento.eventType === 'devolucao.concluida') {
    return atualizarEstadoPublicacao(prisma, evento, 'DEVOLVIDA');
  }

  let publicacao;
  try {
    publicacao = await clientes.obterPublicacao(evento.data.publicacaoId);
  } catch (erro) {
    if (erro.code === grpc.status.NOT_FOUND) {
      await registrarEventoIgnorado(prisma, evento);
      return { duplicado: false, criadas: 0, ignorada: true };
    }
    throw erro;
  }

  const resposta = await clientes.listarBuscasCompativeis(publicacao);
  try {
    return await reconciliarCorrespondencias(prisma, evento, publicacao, resposta.buscas ?? []);
  } catch (erro) {
    if (ehEventoDuplicado(erro)) {
      return { duplicado: true, criadas: 0 };
    }
    throw erro;
  }
}
