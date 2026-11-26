import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { config } from './config.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const PROTO = process.env.PUBLICACOES_PROTO_PATH ?? path.resolve(aqui, '../../../proto/publicacoes.proto');

function carregarPacote() {
  const definicao = protoLoader.loadSync(PROTO, {
    keepCase: true,
    longs: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(definicao).reencontra.publicacoes;
}

export function iniciarServidorGrpc(porta, prisma) {
  const pacote = carregarPacote();
  const servidor = new grpc.Server();

  servidor.addService(pacote.Publicacoes.service, {
    ObterPublicacao: async (chamada, callback) => {
      const id = chamada.request.id;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'Identificador inválido.' });
      }
      try {
        const publicacao = await prisma.publicacao.findUnique({ where: { id } });
        if (!publicacao || publicacao.status !== 'ABERTA') {
          return callback({ code: grpc.status.NOT_FOUND, message: 'Publicação não encontrada.' });
        }
        callback(null, {
          id: publicacao.id,
          referencia: publicacao.referencia,
          usuario_id: publicacao.usuarioId,
          categoria: publicacao.categoria,
          descricao: publicacao.descricao,
          local_aproximado: publicacao.localAproximado,
          data_encontrado: publicacao.dataEncontrado.toISOString().slice(0, 10),
          status: publicacao.status,
        });
      } catch {
        callback({ code: grpc.status.UNAVAILABLE, message: 'Serviço de Publicações indisponível.' });
      }
    },
  });

  return new Promise((resolve, reject) => {
    servidor.bindAsync(`0.0.0.0:${porta}`, grpc.ServerCredentials.createInsecure(), (erro) => {
      if (erro) return reject(erro);
      resolve(servidor);
    });
  });
}
