const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const TIPOS_EVENTO_PUBLICACAO = new Set([
  'publicacao.criada',
  'publicacao.atualizada',
  'publicacao.reaberta',
  'publicacao.arquivada',
  'devolucao.concluida',
]);

const TIPOS_EVENTO_BUSCA = new Set(['busca.criada', 'busca.atualizada']);

export function lerEventoPublicacao(mensagem) {
  let envelope;
  try {
    envelope = JSON.parse(mensagem.content.toString('utf8'));
  } catch {
    throw new Error('O corpo da mensagem não contém JSON válido.');
  }

  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('O envelope do evento é inválido.');
  }
  if (!UUID.test(envelope.eventId ?? '')) throw new Error('O eventId precisa ser um UUID.');
  if (!TIPOS_EVENTO_PUBLICACAO.has(envelope.eventType)) throw new Error('Tipo de evento de publicação não reconhecido.');
  if (mensagem.fields.routingKey !== envelope.eventType) throw new Error('A routing key não corresponde ao eventType.');
  if (!envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
    throw new Error('O conteúdo do evento é inválido.');
  }
  if (!UUID.test(envelope.data.publicacaoId ?? '')) throw new Error('O id da publicação precisa ser um UUID.');
  if (typeof envelope.occurredAt !== 'string' || Number.isNaN(Date.parse(envelope.occurredAt))) {
    throw new Error('A data do evento é inválida.');
  }

  return envelope;
}

export function lerEventoBusca(mensagem) {
  let envelope;
  try {
    envelope = JSON.parse(mensagem.content.toString('utf8'));
  } catch {
    throw new Error('O corpo da mensagem não contém JSON válido.');
  }

  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    throw new Error('O envelope do evento é inválido.');
  }
  if (!UUID.test(envelope.eventId ?? '')) throw new Error('O eventId precisa ser um UUID.');
  if (!TIPOS_EVENTO_BUSCA.has(envelope.eventType)) throw new Error('Tipo de evento de busca não reconhecido.');
  if (mensagem.fields.routingKey !== envelope.eventType) throw new Error('A routing key não corresponde ao eventType.');
  if (!envelope.data || typeof envelope.data !== 'object' || Array.isArray(envelope.data)) {
    throw new Error('O conteúdo do evento é inválido.');
  }
  if (!UUID.test(envelope.data.buscaId ?? '')) throw new Error('O id da busca precisa ser um UUID.');
  if (typeof envelope.occurredAt !== 'string' || Number.isNaN(Date.parse(envelope.occurredAt))) {
    throw new Error('A data do evento é inválida.');
  }
  return envelope;
}

export function lerEvento(mensagem) {
  return TIPOS_EVENTO_BUSCA.has(mensagem.fields.routingKey)
    ? lerEventoBusca(mensagem)
    : lerEventoPublicacao(mensagem);
}

export function prepararCorrespondencias(publicacao, buscas) {
  return buscas.flatMap((busca) => {
    const palavrasEmComum = Array.isArray(busca.palavras_em_comum)
      ? [...new Set(busca.palavras_em_comum.filter((palavra) => typeof palavra === 'string' && palavra.trim()))]
      : [];
    if (
      !UUID.test(busca.id ?? '')
      || typeof busca.usuario_id !== 'string'
      || !busca.usuario_id
      || busca.usuario_id === publicacao.usuario_id
      || palavrasEmComum.length === 0
    ) return [];

    return [{
      buscaId: busca.id,
      usuarioBuscaId: busca.usuario_id,
      palavrasEmComum,
      localPerdido: typeof busca.local_perdido === 'string' && busca.local_perdido.trim()
        ? busca.local_perdido.trim()
        : null,
    }];
  });
}
