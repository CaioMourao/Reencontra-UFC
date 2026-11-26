import { createHmac, randomInt, randomUUID } from 'node:crypto';
import { config } from './config.js';

export function criarCodigoRetirada() {
  return randomInt(10_000_000, 100_000_000).toString();
}

export function hashCodigoRetirada(codigo) {
  return createHmac('sha256', config.PUBLICACOES_CODE_SECRET).update(codigo).digest('hex');
}

export function criarReferencia() {
  const ano = new Date().getUTCFullYear();
  const aleatorio = randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
  return `REN-${ano}-${aleatorio}`;
}
