// Servidor gRPC ValidarToken, usado pelos outros microsserviços.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { verificarAccessToken } from './tokens.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
// No Docker o proto é copiado para /app/proto; em dev fica na raiz do repositório
const PROTO = process.env.AUTH_PROTO_PATH ?? path.resolve(aqui, '../../../proto/auth.proto');

function carregarPacote() {
  const definicao = protoLoader.loadSync(PROTO, {
    keepCase: true,
    longs: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(definicao).reencontra.auth;
}

function validarToken(chamada, callback) {
  const resultado = verificarAccessToken(chamada.request.token);
  if (!resultado.valido) {
    return callback(null, { valido: false, motivo: resultado.motivo });
  }
  const { sub, email, nome } = resultado.payload;
  callback(null, { valido: true, usuario_id: sub, email, nome });
}

export function iniciarServidorGrpc(porta) {
  const pacote = carregarPacote();
  const servidor = new grpc.Server();
  servidor.addService(pacote.Autenticacao.service, { ValidarToken: validarToken });

  return new Promise((resolve, reject) => {
    // Sem TLS: a porta gRPC fica só na rede interna do Docker e não é
    // publicada para fora (veja docker-compose.yml).
    servidor.bindAsync(`0.0.0.0:${porta}`, grpc.ServerCredentials.createInsecure(), (erro) => {
      if (erro) return reject(erro);
      resolve(servidor);
    });
  });
}
