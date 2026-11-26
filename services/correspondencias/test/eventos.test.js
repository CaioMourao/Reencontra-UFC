import test from 'node:test';
import assert from 'node:assert/strict';
import { lerEventoPublicacao, prepararCorrespondencias } from '../src/eventos.js';

const PUBLICACAO_ID = '750f4757-ffb8-4ab5-a834-4e018087d7e9';
const BUSCA_ID = 'e95f146b-d8a5-42f9-839d-3cb39c3455e0';
const USUARIO_PUBLICACAO = 'usuario-1';

function mensagem(overrides = {}) {
  const eventType = overrides.eventType ?? 'publicacao.criada';
  const envelope = {
    eventId: '1670126a-018e-4973-b2b7-f4ff98aad6a4',
    eventType,
    occurredAt: '2026-11-27T12:00:00.000Z',
    data: { publicacaoId: PUBLICACAO_ID, referencia: 'REN-2026-ABC12345', usuarioId: USUARIO_PUBLICACAO },
    ...overrides,
  };
  return {
    content: Buffer.from(JSON.stringify(envelope)),
    fields: { routingKey: eventType },
  };
}

test('aceita evento de publicação bem formado e alinha a routing key', () => {
  assert.equal(lerEventoPublicacao(mensagem()).eventType, 'publicacao.criada');
  assert.throws(() => lerEventoPublicacao({ ...mensagem(), fields: { routingKey: 'contato.solicitado' } }), /routing key/);
});

test('rejeita eventos inválidos e tipos que não pertencem à fila', () => {
  assert.throws(() => lerEventoPublicacao({ content: Buffer.from('{'), fields: { routingKey: 'publicacao.criada' } }), /JSON válido/);
  assert.throws(() => lerEventoPublicacao(mensagem({ eventType: 'contato.solicitado' })), /não reconhecido/);
  assert.throws(() => lerEventoPublicacao(mensagem({ data: { publicacaoId: 'invalido' } })), /UUID/);
});

test('prepara apenas buscas de outros usuários com palavras coincidentes', () => {
  const resultado = prepararCorrespondencias({ usuario_id: USUARIO_PUBLICACAO }, [
    { id: BUSCA_ID, usuario_id: 'usuario-2', palavras_em_comum: ['fone', 'fone'], local_perdido: 'Biblioteca' },
    { id: '8c99c1fc-cb32-4a37-b918-94838f26f30a', usuario_id: USUARIO_PUBLICACAO, palavras_em_comum: ['fone'] },
    { id: 'cbfa2d63-1a1a-4cc6-b2e7-4799f76ba301', usuario_id: 'usuario-3', palavras_em_comum: [] },
  ]);
  assert.equal(resultado.length, 1);
  assert.deepEqual(resultado[0], {
    buscaId: BUSCA_ID,
    usuarioBuscaId: 'usuario-2',
    palavrasEmComum: ['fone'],
    localPerdido: 'Biblioteca',
  });
});
