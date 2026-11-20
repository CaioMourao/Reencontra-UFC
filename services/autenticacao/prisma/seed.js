// Cria um usuário de teste enquanto o cadastro não está pronto.
// Uso: npm run seed
// Para escolher os dados: SEED_EMAIL=... SEED_SENHA=... SEED_NOME=... npm run seed
import { prisma } from '../src/db.js';
import { gerarHashSenha } from '../src/senhas.js';

const email = (process.env.SEED_EMAIL ?? 'teste@alu.ufc.br').toLowerCase();
const senha = process.env.SEED_SENHA ?? 'Reencontra@2026';
const nome = process.env.SEED_NOME ?? 'Usuário de Teste';

const senhaHash = await gerarHashSenha(senha);
await prisma.usuario.upsert({
  where: { email },
  update: { senhaHash, nome, tentativasFalhas: 0, bloqueadoAte: null },
  create: { email, senhaHash, nome },
});
console.log(`Usuário de teste pronto: ${email}`);
await prisma.$disconnect();
