import { z } from 'zod';

const uuid = z.string().uuid();
const eventoSchema = z.object({
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
  return {
    eventId: evento.eventId,
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
