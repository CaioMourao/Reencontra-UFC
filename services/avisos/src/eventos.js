import { z } from 'zod';

const uuid = z.string().uuid();
const eventoCorrespondenciaSchema = z.object({
  eventId: uuid,
  eventType: z.literal('correspondencia.sugerida'),
  occurredAt: z.string().datetime({ offset: true }),
  data: z.object({
    correspondenciaId: uuid,
    usuarioId: z.string().min(1).max(64),
    publicacaoId: uuid,
    buscaId: uuid,
    referencia: z.string().min(1).max(24),
    categoria: z.string().min(1).max(60),
    palavrasEmComum: z.array(z.string().min(1).max(80)).max(30),
    localPerdido: z.string().max(120).nullable().optional(),
    motivo: z.enum(['NOVA_CORRESPONDENCIA', 'ANUNCIO_REABERTO']).optional(),
  }),
});

const eventoContatoSolicitadoSchema = z.object({
  eventId: uuid,
  eventType: z.literal('contato.solicitado'),
  occurredAt: z.string().datetime({ offset: true }),
  data: z.object({
    solicitacaoId: uuid,
    publicacaoId: uuid,
    referencia: z.string().min(1).max(24),
    categoria: z.string().min(1).max(60).optional(),
    solicitanteId: z.string().min(1).max(64),
    donoId: z.string().min(1).max(64),
  }),
});

const eventoMensagemContatoSchema = z.object({
  eventId: uuid,
  eventType: z.literal('contato.mensagem_enviada'),
  occurredAt: z.string().datetime({ offset: true }),
  data: z.object({
    mensagemId: uuid,
    solicitacaoId: uuid,
    publicacaoId: uuid,
    referencia: z.string().min(1).max(24),
    destinatarioId: z.string().min(1).max(64),
  }),
});

const eventoCodigoRetiradaRenovadoSchema = z.object({
  eventId: uuid,
  eventType: z.literal('contato.codigo_retirada_renovado'),
  occurredAt: z.string().datetime({ offset: true }),
  data: z.object({
    solicitacaoId: uuid,
    publicacaoId: uuid,
    referencia: z.string().min(1).max(24),
    categoria: z.string().min(1).max(60).optional(),
    solicitanteId: z.string().min(1).max(64),
    donoId: z.string().min(1).max(64),
  }),
});

const eventoSchema = z.discriminatedUnion('eventType', [
  eventoCorrespondenciaSchema,
  eventoContatoSolicitadoSchema,
  eventoMensagemContatoSchema,
  eventoCodigoRetiradaRenovadoSchema,
]);

export function lerEventoAviso(mensagem) {
  let envelope;
  try {
    envelope = JSON.parse(mensagem.content.toString('utf8'));
  } catch {
    throw new Error('O corpo da mensagem não contém JSON válido.');
  }
  const evento = eventoSchema.parse(envelope);
  if (mensagem.fields.routingKey !== evento.eventType) {
    throw new Error('A routing key não corresponde ao eventType.');
  }
  return evento;
}

export function dadosAviso(evento) {
  if (evento.eventType === 'contato.solicitado') {
    return {
      eventId: evento.eventId,
      tipo: 'CONTATO_SOLICITADO',
      solicitacaoContatoId: evento.data.solicitacaoId,
      usuarioId: evento.data.donoId,
      publicacaoId: evento.data.publicacaoId,
      referencia: evento.data.referencia,
      categoria: evento.data.categoria ?? null,
      palavrasEmComum: [],
      ocorridoEm: new Date(evento.occurredAt),
    };
  }

  if (evento.eventType === 'contato.codigo_retirada_renovado') {
    return {
      eventId: evento.eventId,
      tipo: 'CONTATO_CODIGO_RENOVADO',
      solicitacaoContatoId: evento.data.solicitacaoId,
      usuarioId: evento.data.donoId,
      publicacaoId: evento.data.publicacaoId,
      referencia: evento.data.referencia,
      categoria: evento.data.categoria ?? null,
      palavrasEmComum: [],
      ocorridoEm: new Date(evento.occurredAt),
    };
  }

  return {
    eventId: evento.eventId,
    tipo: 'CORRESPONDENCIA',
    correspondenciaId: evento.data.correspondenciaId,
    usuarioId: evento.data.usuarioId,
    publicacaoId: evento.data.publicacaoId,
    buscaId: evento.data.buscaId,
    referencia: evento.data.referencia,
    categoria: evento.data.categoria,
    palavrasEmComum: [...new Set(evento.data.palavrasEmComum.map((p) => p.trim()).filter(Boolean))],
    localPerdido: evento.data.localPerdido?.trim() || null,
    motivo: evento.data.motivo ?? 'NOVA_CORRESPONDENCIA',
    ocorridoEm: new Date(evento.occurredAt),
  };
}
