import { createServer } from 'node:http';
import { config } from './config.js';
import { prisma } from './db.js';
import { criarApp } from './app.js';
import { iniciarConsumidor } from './consumidor.js';
import { anexarWebSocket } from './websocket.js';

await prisma.$connect();
const http = createServer();
const websocket = anexarWebSocket(http);
const consumidor = iniciarConsumidor(prisma, websocket.notificar);
const app = criarApp(prisma, () => consumidor.estaPronto());
http.on('request', app);
http.listen(config.PORT, () => {
  console.log(`[avisos] REST em http://localhost:${config.PORT}`);
  console.log(`[avisos] WebSocket em ws://localhost:${config.PORT}/ws`);
});

let encerrando = false;
async function encerrar(sinal) {
  if (encerrando) return;
  encerrando = true;
  console.log(`[avisos] ${sinal} recebido, encerrando...`);
  websocket.parar();
  await new Promise((resolve) => http.close(resolve));
  await consumidor.parar();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', () => encerrar('SIGTERM'));
process.on('SIGINT', () => encerrar('SIGINT'));
