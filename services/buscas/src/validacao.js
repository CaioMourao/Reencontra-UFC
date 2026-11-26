import { z } from 'zod';
import { extrairTermos, normalizarPalavras } from './compatibilidade.js';

const formatoData = /^\d{4}-\d{2}-\d{2}$/;

function dataExiste(valor) {
  if (!formatoData.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

const palavraSchema = z.string()
  .trim()
  .min(2, 'Cada palavra-chave precisa ter pelo menos 2 caracteres.')
  .max(50, 'Cada palavra-chave pode ter no máximo 50 caracteres.');

const dataSchema = z.union([
  z.null(),
  z.string()
    .regex(formatoData, 'Use uma data válida no formato AAAA-MM-DD.')
    .refine(dataExiste, 'Informe uma data existente.'),
]).default(null);

export const criarBuscaSchema = z.object({
  categoria: z.string().trim()
    .min(2, 'A categoria precisa ter pelo menos 2 caracteres.')
    .max(60, 'A categoria pode ter no máximo 60 caracteres.'),
  palavrasChave: z.array(palavraSchema)
    .min(1, 'Informe pelo menos uma palavra-chave.')
    .max(12, 'Informe no máximo 12 palavras-chave.')
    .transform((palavras) => [...new Set(palavras.map((palavra) => palavra.trim()))]),
  localPerdido: z.union([
    z.null(),
    z.string().trim()
      .min(3, 'O local perdido precisa ter pelo menos 3 caracteres.')
      .max(120, 'O local perdido pode ter no máximo 120 caracteres.'),
  ]).default(null),
  dataInicio: dataSchema,
  dataFim: dataSchema,
}).strict().superRefine((dados, contexto) => {
  if ((dados.dataInicio === null) !== (dados.dataFim === null)) {
    contexto.addIssue({
      code: 'custom',
      path: ['dataFim'],
      message: 'Informe as duas datas do período ou deixe ambas vazias.',
    });
  }
  if (dados.dataInicio && dados.dataFim && dados.dataInicio > dados.dataFim) {
    contexto.addIssue({
      code: 'custom',
      path: ['dataFim'],
      message: 'A data final precisa ser igual ou posterior à data inicial.',
    });
  }
  if (dados.palavrasChave.length > 0 && normalizarPalavras(dados.palavrasChave).flatMap(extrairTermos).length === 0) {
    contexto.addIssue({
      code: 'custom',
      path: ['palavrasChave'],
      message: 'Use termos descritivos, não apenas preposições.',
    });
  }
});

export const filtrosBuscasSchema = z.object({
  q: z.string().trim().max(100, 'A busca pode ter no máximo 100 caracteres.').default(''),
  categoria: z.string().trim().max(60, 'A categoria pode ter no máximo 60 caracteres.').default(''),
  status: z.enum(['ATIVA', 'ARQUIVADA', 'TODAS']).default('ATIVA'),
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(50).default(12),
}).strict();

export function validarId(valor) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valor)) {
    const erro = new Error('Identificador inválido.');
    erro.status = 400;
    throw erro;
  }
  return valor;
}

export function paraDataUtc(valor) {
  return valor ? new Date(valor + 'T00:00:00.000Z') : null;
}

export function dataAtualUtc() {
  return new Date().toISOString().slice(0, 10);
}

export function normalizarPalavrasBusca(palavras) {
  const vistas = new Set();
  return palavras.filter((palavra) => {
    const normalizada = normalizarPalavras([palavra])[0];
    if (!normalizada || vistas.has(normalizada)) return false;
    vistas.add(normalizada);
    return true;
  });
}

export function normalizarCategoria(categoria) {
  return normalizarPalavras([categoria])[0] ?? '';
}
