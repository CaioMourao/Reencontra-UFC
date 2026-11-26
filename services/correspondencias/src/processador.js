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

async function enfileirarAviso(tx, id, publicacao, correspondencia, motivo) {
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
        motivo,
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
  const motivoAviso = evento.eventType === 'publicacao.reaberta'
    ? 'ANUNCIO_REABERTO'
    : 'NOVA_CORRESPONDENCIA';
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
        await enfileirarAviso(tx, nova.id, publicacao, correspondencia, motivoAviso);
        criadas += 1;
      } else {
        await tx.correspondencia.update({
          where: { id: existente.id },
          data: { ...dados, status: 'ATIVA' },
        });
        if (existente.status !== 'ATIVA') {
          await enfileirarAviso(tx, existente.id, publicacao, correspondencia, motivoAviso);
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

export async function processarEventoBusca(prisma, clientes, evento) {
  if (await prisma.eventoProcessado.findUnique({ where: { id: evento.eventId }, select: { id: true } })) {
    return { duplicado: true, criadas: 0 };
  }

  let pagina = 1;
  let criadas = 0;
  while (true) {
    const respostaPublicacoes = await clientes.listarPublicacoesAbertas(pagina, 100);
    const preparadasPorPublicacao = [];
    const publicacoes = respostaPublicacoes.publicacoes ?? [];
    const respostaCompatibilidades = await clientes.listarPublicacoesCompativeis(evento.data.buscaId, publicacoes);
    const porPublicacao = new Map((respostaCompatibilidades.publicacoes ?? []).map((item) => [item.publicacao_id, item]));
    for (const publicacao of publicacoes) {
      const compatibilidade = porPublicacao.get(publicacao.id);
      if (!compatibilidade) continue;
      const preparadas = prepararCorrespondencias(publicacao, [{
        id: evento.data.buscaId,
        usuario_id: compatibilidade.usuario_busca_id,
        palavras_em_comum: compatibilidade.palavras_em_comum,
        local_perdido: compatibilidade.local_perdido,
      }]);
      for (const correspondencia of preparadas) {
        preparadasPorPublicacao.push({ publicacao, correspondencia });
      }
    }

    if (preparadasPorPublicacao.length > 0) {
      criadas += await prisma.$transaction(async (tx) => {
        let novas = 0;
        for (const { publicacao, correspondencia } of preparadasPorPublicacao) {
          const dados = dadosCorrespondencia(publicacao, correspondencia);
          const id = randomUUID();
          const insercao = await tx.correspondencia.createMany({
            data: [{ id, ...dados }],
            skipDuplicates: true,
          });
          if (insercao.count === 1) {
            await enfileirarAviso(tx, id, publicacao, correspondencia, 'NOVA_CORRESPONDENCIA');
            novas += 1;
            continue;
          }

          const existente = await tx.correspondencia.findUnique({
            where: { publicacaoId_buscaId: { publicacaoId: publicacao.id, buscaId: correspondencia.buscaId } },
          });
          if (!existente) continue;
          if (existente.status === 'ATIVA') {
            await tx.correspondencia.update({ where: { id: existente.id }, data: dados });
            continue;
          }

          const atualizacao = await tx.correspondencia.updateMany({
            where: { id: existente.id, status: existente.status },
            data: { ...dados, status: 'ATIVA' },
          });
          if (atualizacao.count === 1) {
            await enfileirarAviso(tx, existente.id, publicacao, correspondencia, 'NOVA_CORRESPONDENCIA');
            novas += 1;
          }
        }
        return novas;
      });
    }

    if (!respostaPublicacoes.tem_proxima) break;
    pagina += 1;
  }

  const registrado = await prisma.$transaction((tx) => reservarEvento(tx, evento));
  if (!registrado) return { duplicado: true, criadas: 0 };
  return { duplicado: false, criadas };
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
