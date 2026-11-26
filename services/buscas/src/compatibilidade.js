const palavrasIgnoradas = new Set([
  'a', 'as', 'ao', 'aos', 'com', 'da', 'das', 'de', 'do', 'dos',
  'e', 'em', 'na', 'nas', 'no', 'nos', 'o', 'os', 'para', 'por',
  'sem', 'um', 'uma', 'uns', 'umas',
]);

export function normalizarTexto(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizarPalavras(palavras) {
  return [...new Set(palavras.map((palavra) => normalizarTexto(palavra)).filter(Boolean))];
}

export function extrairTermos(valor) {
  return [...new Set(
    normalizarTexto(valor)
      .split(' ')
      .filter((termo) => termo.length >= 2 && !palavrasIgnoradas.has(termo)),
  )];
}

export function encontrarPalavrasEmComum(palavrasChave, descricao) {
  const termosDescricao = new Set(extrairTermos(descricao));
  const termosBusca = new Set(palavrasChave.flatMap(extrairTermos));
  return [...termosBusca].filter((termo) => termosDescricao.has(termo));
}

export function filtrarBuscasCompativeis(buscas, publicacao) {
  const categoria = normalizarTexto(publicacao.categoria);
  return buscas.flatMap((busca) => {
    if (busca.status !== 'ATIVA') return [];
    if (normalizarTexto(busca.categoriaNormalizada ?? busca.categoria) !== categoria) return [];

    const data = publicacao.dataEncontrado;
    if (busca.dataInicio && data < dataIso(busca.dataInicio)) return [];
    if (busca.dataFim && data > dataIso(busca.dataFim)) return [];

    const palavrasEmComum = encontrarPalavrasEmComum(busca.palavrasChave ?? [], publicacao.descricao);
    if (palavrasEmComum.length === 0) return [];
    return [{ busca, palavrasEmComum }];
  });
}

function dataIso(valor) {
  return valor instanceof Date ? valor.toISOString().slice(0, 10) : String(valor).slice(0, 10);
}
