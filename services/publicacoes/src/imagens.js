import { randomUUID } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import multer from 'multer';
import { config } from './config.js';
import { ErroHttp } from './erros.js';

export const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;

const formatos = [
  {
    mime: 'image/jpeg',
    extensao: 'jpg',
    // O marcador SOI (FFD8) é a assinatura mínima estável do JPEG; não
    // exigimos um cabeçalho JFIF ou EXIF específico.
    assinatura: (buffer) => buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8,
  },
  { mime: 'image/png', extensao: 'png', assinatura: (buffer) => buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/webp', extensao: 'webp', assinatura: (buffer) => buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP' },
];

const diretorio = resolve(config.PUBLICACOES_UPLOAD_DIR);

export const receberImagem = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LIMITE_IMAGEM_BYTES, files: 1, fields: 5, fieldSize: 10 * 1024 },
  fileFilter(_req, file, callback) {
    if (!formatos.some(({ mime }) => mime === file.mimetype)) {
      callback(new ErroHttp(400, 'A foto deve estar no formato JPG, PNG ou WebP.'));
      return;
    }
    callback(null, true);
  },
});

function detectarFormato(file) {
  // A extensão e o MIME enviados pelo navegador podem não refletir o conteúdo.
  // A assinatura detectada determina o MIME e a extensão que serão persistidos.
  return formatos.find(({ assinatura }) => assinatura(file.buffer));
}

export async function salvarImagem(file) {
  if (!file) return null;
  const formato = detectarFormato(file);
  if (!formato) throw new ErroHttp(400, 'O arquivo não parece ser uma imagem JPG, PNG ou WebP válida.');

  await mkdir(diretorio, { recursive: true });
  const arquivo = `${randomUUID()}.${formato.extensao}`;
  await writeFile(join(diretorio, arquivo), file.buffer, { flag: 'wx', mode: 0o600 });
  return { arquivo, mime: formato.mime };
}

export function caminhoImagem(arquivo) {
  if (typeof arquivo !== 'string' || !/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(arquivo)) return null;
  return join(diretorio, arquivo);
}

export async function excluirImagem(arquivo) {
  const caminho = caminhoImagem(arquivo);
  if (caminho) await rm(caminho, { force: true });
}
