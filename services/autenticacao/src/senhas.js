import bcrypt from 'bcrypt';
import { config } from './config.js';

export function gerarHashSenha(senha) {
  return bcrypt.hash(senha, config.BCRYPT_CUSTO);
}

export function conferirSenha(senha, hash) {
  return bcrypt.compare(senha, hash);
}

// Hash de uma senha qualquer, usado quando o e-mail não existe: assim o
// login leva o mesmo tempo nos dois casos e não revela quais e-mails têm conta.
export const HASH_FALSO = bcrypt.hashSync('senha-que-nao-existe', config.BCRYPT_CUSTO);
