import { config } from './config.js';
import { prisma } from './db.js';
import { criarApp } from './app.js';
import { iniciarServidorGrpc } from './grpc.js';

await prisma.$connect();
const grpcServidor = await iniciarServidorGrpc(config.GRPC_PORT, prisma);
const app = criarApp(prisma);
const http = app.listen(config.PORT, () => {
  console.log('[buscas] REST em http://localhost:' + config.PORT);
  console.log('[buscas] gRPC em 0.0.0.0:' + config.GRPC_PORT);
});

let encerrando = false;
async function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;
  console.log('[buscas] ' + sinal + ' recebido, encerrando...');
  await new Promise((resolve) => http.close(resolve));
  await new Promise((resolve) => grpcServidor.tryShutdown(resolve));
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
