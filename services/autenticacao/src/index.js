import { config } from './config.js';
import { criarApp } from './app.js';
import { iniciarServidorGrpc } from './grpc.js';
import { prisma } from './db.js';

const app = criarApp();
const http = app.listen(config.PORT, () => {
  console.log(`[autenticacao] REST em http://localhost:${config.PORT}`);
});
const grpcServidor = await iniciarServidorGrpc(config.GRPC_PORT);
console.log(`[autenticacao] gRPC em 0.0.0.0:${config.GRPC_PORT}`);

async function encerrar(sinal) {
  console.log(`[autenticacao] ${sinal} recebido, encerrando...`);
  http.close();
  grpcServidor.tryShutdown(() => {});
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
