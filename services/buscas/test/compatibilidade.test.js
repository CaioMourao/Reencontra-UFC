import test from 'node:test';
import assert from 'node:assert/strict';
import {
  encontrarPalavrasEmComum,
  filtrarBuscasCompativeis,
  normalizarTexto,
} from '../src/compatibilidade.js';

function criarBusca(overrides = {}) {
  return {
    id: 'busca-1',
    usuarioId: 'usuario-1',
    categoria: 'Eletrônicos',
    categoriaNormalizada: 'eletronicos',
    palavrasChave: ['fone', 'preto'],
    dataInicio: null,
    dataFim: null,
    status: 'ATIVA',
    ...overrides,
  };
}

test('normaliza acentos e diferenças de caixa', () => {
  assert.equal(normalizarTexto('  FÔNE de Ouvido!  '), 'fone de ouvido');
});

test('calcula palavras realmente compartilhadas sem contar preposições', () => {
  assert.deepEqual(encontrarPalavrasEmComum(['fone de ouvido', 'preto'], 'Fone preto encontrado'), ['fone', 'preto']);
});

test('exige categoria e pelo menos uma palavra-chave em comum', () => {
  const resultados = filtrarBuscasCompativeis(
    [criarBusca(), criarBusca({ id: 'busca-2', categoriaNormalizada: 'mochilas' })],
    { categoria: 'ELETRÔNICOS', descricao: 'Fone sem fio preto', dataEncontrado: '2026-11-26' },
  );
  assert.equal(resultados.length, 1);
  assert.deepEqual(resultados[0].palavrasEmComum, ['fone', 'preto']);
});

test('respeita o período da busca e aceita período aberto', () => {
  const buscas = [
    criarBusca({ dataInicio: new Date('2026-11-01T00:00:00.000Z'), dataFim: new Date('2026-11-15T00:00:00.000Z') }),
    criarBusca({ id: 'busca-2', dataInicio: null, dataFim: null }),
  ];
  const dentroDoPeriodo = filtrarBuscasCompativeis(buscas, {
    categoria: 'Eletrônicos', descricao: 'fone preto', dataEncontrado: '2026-11-10',
  });
  const foraDoPeriodo = filtrarBuscasCompativeis(buscas.slice(0, 1), {
    categoria: 'Eletrônicos', descricao: 'fone preto', dataEncontrado: '2026-11-20',
  });
  assert.equal(dentroDoPeriodo.length, 2);
  assert.equal(foraDoPeriodo.length, 0);
});

test('ignora buscas arquivadas e publicações sem termos compatíveis', () => {
  const resultados = filtrarBuscasCompativeis(
    [criarBusca({ status: 'ARQUIVADA' }), criarBusca({ id: 'busca-2' })],
    { categoria: 'Eletrônicos', descricao: 'carregador branco', dataEncontrado: '2026-11-26' },
  );
  assert.deepEqual(resultados, []);
});
