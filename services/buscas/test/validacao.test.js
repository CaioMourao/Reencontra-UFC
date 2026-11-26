import test from 'node:test';
import assert from 'node:assert/strict';
import { criarBuscaSchema } from '../src/validacao.js';

const buscaValida = {
  categoria: 'Eletrônicos',
  palavrasChave: ['fone', 'preto'],
  dataInicio: '2026-11-01',
  dataFim: '2026-11-20',
};

test('aceita busca com palavras-chave e período válido', () => {
  assert.equal(criarBuscaSchema.safeParse(buscaValida).success, true);
});

test('exige ao menos uma palavra-chave', () => {
  const resultado = criarBuscaSchema.safeParse({ ...buscaValida, palavrasChave: [] });
  assert.equal(resultado.success, false);
});

test('rejeita palavras-chave sem termos descritivos', () => {
  const resultado = criarBuscaSchema.safeParse({ ...buscaValida, palavrasChave: ['de', 'para'] });
  assert.equal(resultado.success, false);
});

test('exige as duas datas ou nenhuma', () => {
  const resultado = criarBuscaSchema.safeParse({ ...buscaValida, dataFim: null });
  assert.equal(resultado.success, false);
});

test('rejeita datas invertidas e datas inexistentes', () => {
  assert.equal(criarBuscaSchema.safeParse({ ...buscaValida, dataInicio: '2026-11-21' }).success, false);
  assert.equal(criarBuscaSchema.safeParse({ ...buscaValida, dataFim: '2026-02-30' }).success, false);
});

test('remove palavras-chave duplicadas', () => {
  const resultado = criarBuscaSchema.safeParse({ ...buscaValida, palavrasChave: ['fone', 'fone'] });
  assert.equal(resultado.success, true);
  assert.deepEqual(resultado.data.palavrasChave, ['fone']);
});
