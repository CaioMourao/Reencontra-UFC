import { z } from 'zod';
import { ErroHttp } from './erros.js';

const email = /[\w.+-]+@[\w.-]+\.[A-Z]{2,}/i;
const telefone = /(?<!\d)(?:\+?55[ .-]?)?(?:\(?\d{2}\)?[ .-]?)?(?:9\d{4}|[2-9]\d{3})[ .-]?\d{4}(?!\d)/g;
const pistaTelefone = /\b(telefone|celular|whats(?:app)?|zap|fone|ligar|contato)\b/i;

function contemContatoPessoal(valor) {
  if (email.test(valor)) return true;
  return [...valor.matchAll(telefone)].some((match) => {
    const digitos = match[0].replace(/\D/g, '');
    return digitos.length >= 10 || pistaTelefone.test(valor);
  });
}

const campoTexto = (rotulo, max, minimo = 2) =>
  z
    .string()
    .trim()
    .min(minimo, `${rotulo} precisa ter pelo menos ${minimo} caracteres.`)
    .max(max, `${rotulo} pode ter no máximo ${max} caracteres.`)
    .refine((valor) => !contemContatoPessoal(valor), {
      message: 'Não inclua telefone ou e-mail; o contato deve acontecer pela plataforma.',
    });

export const dataDiaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use uma data válida no formato AAAA-MM-DD.').refine((valor) => {
  const data = new Date(`${valor}T00:00:00.000Z`);
  return Number.isFinite(data.getTime()) && data.toISOString().slice(0, 10) === valor;
}, 'A data informada não existe.');

export function paraDataUtc(valor) {
  return new Date(`${valor}T00:00:00.000Z`);
}

export function adicionarDiasUtc(data, dias) {
  const resultado = new Date(data);
  resultado.setUTCDate(resultado.getUTCDate() + dias);
  return resultado;
}

export const criarPublicacaoSchema = z.object({
  categoria: campoTexto('Categoria', 60),
  descricao: campoTexto('Descrição', 500, 10),
  localAproximado: campoTexto('Local aproximado', 120, 3),
  dataEncontrado: dataDiaSchema,
}).strict();

export const atualizarPublicacaoSchema = z.object({
  categoria: campoTexto('Categoria', 60).optional(),
  descricao: campoTexto('Descrição', 500, 10).optional(),
  localAproximado: campoTexto('Local aproximado', 120, 3).optional(),
  dataEncontrado: dataDiaSchema.optional(),
}).strict();

export const filtrosPublicacoesSchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  categoria: z.string().trim().min(1).max(60).optional(),
  de: dataDiaSchema.optional(),
  ate: dataDiaSchema.optional(),
  status: z.enum(['ABERTA', 'ARQUIVADA', 'DEVOLVIDA']).optional(),
  minhas: z.enum(['true', 'false']).default('false'),
  pagina: z.coerce.number().int().min(1).max(10000).default(1),
  porPagina: z.coerce.number().int().min(1).max(50).default(12),
}).strict().superRefine((dados, contexto) => {
  if (dados.de && dados.ate && dados.de > dados.ate) {
    contexto.addIssue({ code: 'custom', path: ['de'], message: 'A data inicial deve ser anterior à data final.' });
  }
  if (dados.status && dados.status !== 'ABERTA' && dados.minhas !== 'true') {
    contexto.addIssue({ code: 'custom', path: ['minhas'], message: 'Anúncios arquivados ou devolvidos só aparecem em Minhas publicações.' });
  }
});

export const solicitarContatoSchema = z.object({}).strict();

export const confirmarDevolucaoSchema = z.object({
  codigoRetirada: z.string().regex(/^\d{8}$/, 'O código de retirada precisa ter 8 dígitos.'),
}).strict();

export function validarId(id) {
  const resultado = z.string().uuid().safeParse(id);
  if (!resultado.success) throw new ErroHttp(400, 'Identificador inválido.');
  return resultado.data;
}

export function validarDataEncontrado(data) {
  const partes = new Intl.DateTimeFormat('en', {
    timeZone: 'America/Fortaleza',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const hojeLocal = `${partes.find((parte) => parte.type === 'year').value}-${partes.find((parte) => parte.type === 'month').value}-${partes.find((parte) => parte.type === 'day').value}`;
  if (data.toISOString().slice(0, 10) > hojeLocal) {
    throw new ErroHttp(400, 'A data em que o objeto foi encontrado não pode estar no futuro.');
  }
}
