import test from 'node:test';
import assert from 'node:assert/strict';
import { dadosAviso, lerEventoAviso } from '../src/eventos.js';

const eventoValido = {
  eventId: '1670126a-018e-4973-b2b7-f4ff98aad6a4',
  eventType: 'correspondencia.sugerida',
  occurredAt: '2026-11-26T12:00:00.000Z',
  data: {
    correspondenciaId: '750f4757-ffb8-4ab5-a834-4e018087d7e9',
    usuarioId: 'e8d28451-80e1-4f06-85bd-92fb9868c027',
    publicacaoId: 'b74dc5c3-708e-48ce-b9d4-44cfc7a3c126',
    buscaId: 'e95f146b-d8a5-42f9-839d-3cb39c3455e0',
    referencia: 'REN-2026-ABC12345',
    categoria: 'Acessórios',
    palavrasEmComum: [' chaveiro ', 'azul', 'chaveiro'],
    localPerdido: ' Cantina ',
  },
};

function mensagem(evento = eventoValido, routingKey = evento.eventType) {
  return { content: Buffer.from(JSON.stringify(evento)), fields: { routingKey } };
}

test('aceita sugestão de correspondência válida e valida a routing key', () => {
  assert.equal(lerEventoAviso(mensagem()).eventType, 'correspondencia.sugerida');
  assert.throws(() => lerEventoAviso(mensagem(eventoValido, 'avisos.q')), /routing key/);
});

test('descarta JSON malformado e eventos que não são sugestões', () => {
  assert.throws(() => lerEventoAviso({ content: Buffer.from('{'), fields: { routingKey: 'correspondencia.sugerida' } }), /JSON válido/);
  assert.throws(() => lerEventoAviso(mensagem({ ...eventoValido, eventType: 'publicacao.criada' })), /Invalid (input|discriminator value)/);
});

test('mapeia o contrato para persistência sem palavras duplicadas e limpa textos', () => {
  const aviso = dadosAviso(lerEventoAviso(mensagem()));
  assert.deepEqual(aviso.palavrasEmComum, ['chaveiro', 'azul']);
  assert.equal(aviso.localPerdido, 'Cantina');
  assert.equal(aviso.usuarioId, eventoValido.data.usuarioId);
  assert.equal(aviso.ocorridoEm.toISOString(), eventoValido.occurredAt);
});

test('aceita contato.solicitado e cria aviso para o autor sem dados pessoais', () => {
  const evento = {
    eventId: '1670126a-018e-4973-b2b7-f4ff98aad6a4',
    eventType: 'contato.solicitado',
    occurredAt: '2026-11-26T12:00:00.000Z',
    data: {
      solicitacaoId: '750f4757-ffb8-4ab5-a834-4e018087d7e9',
      publicacaoId: 'b74dc5c3-708e-48ce-b9d4-44cfc7a3c126',
      referencia: 'REN-2026-ABC12345',
      categoria: 'Acessórios',
      solicitanteId: 'solicitante-1',
      donoId: 'dono-1',
    },
  };

  const lido = lerEventoAviso(mensagem(evento));
  const aviso = dadosAviso(lido);
  assert.equal(aviso.tipo, 'CONTATO_SOLICITADO');
  assert.equal(aviso.solicitacaoContatoId, evento.data.solicitacaoId);
  assert.equal(aviso.usuarioId, evento.data.donoId);
  assert.equal(aviso.publicacaoId, evento.data.publicacaoId);
  assert.equal(aviso.categoria, evento.data.categoria);
  assert.deepEqual(aviso.palavrasEmComum, []);
  assert.throws(() => lerEventoAviso(mensagem(evento, 'correspondencia.sugerida')), /routing key/);
});

test('aceita evento de mensagem para atualização WebSocket sem exigir o conteúdo da mensagem', () => {
  const evento = {
    eventId: '1670126a-018e-4973-b2b7-f4ff98aad6a4',
    eventType: 'contato.mensagem_enviada',
    occurredAt: '2026-11-26T12:00:00.000Z',
    data: {
      mensagemId: '750f4757-ffb8-4ab5-a834-4e018087d7e9',
      solicitacaoId: 'b74dc5c3-708e-48ce-b9d4-44cfc7a3c126',
      publicacaoId: 'e95f146b-d8a5-42f9-839d-3cb39c3455e0',
      referencia: 'REN-2026-ABC12345',
      destinatarioId: 'destinatario-1',
    },
  };

  assert.equal(lerEventoAviso(mensagem(evento)).data.destinatarioId, 'destinatario-1');
  assert.throws(() => lerEventoAviso(mensagem(evento, 'contato.solicitado')), /routing key/);
});
