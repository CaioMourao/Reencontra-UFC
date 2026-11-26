import { config } from './config.js';
import { prisma } from './db.js';
import { criarApp } from './app.js';
import { criarClientesGrpc } from './grpc-clientes.js';
import { iniciarConsumidor } from './consumidor.js';
import { iniciarPublicadorOutbox } from './publicador-outbox.js';

await prisma.$connect();
const clientes = criarClientesGrpc();
const consumidor = iniciarConsumidor(prisma, clientes);
const publicador = iniciarPublicadorOutbox(prisma);
const app = criarApp(prisma, () => consumidor.estaPronto() && publicador.estaPronto());
const http = app.listen(config.PORT, () => {
  console.log(`[correspondencias] health em http://localhost:${config.PORT}/health`);
});

let encerrando = false;
async function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;
  console.log(`[correspondencias] ${sinal} recebido, encerrando...`);
  await new Promise((resolve) => http.close(resolve));
  await consumidor.parar();
  await publicador.parar();
  clientes.fechar();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
