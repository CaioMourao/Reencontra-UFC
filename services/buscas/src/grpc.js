import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { config } from './config.js';
import { filtrarBuscasCompativeis, normalizarTexto } from './compatibilidade.js';
import { paraDataUtc } from './validacao.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const PROTO = process.env.BUSCAS_PROTO_PATH ?? path.resolve(aqui, '../../../proto/buscas.proto');
const formatoData = /^\d{4}-\d{2}-\d{2}$/;

function carregarPacote() {
  const definicao = protoLoader.loadSync(PROTO, {
    keepCase: true,
    longs: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(definicao).reencontra.buscas;
}

export function iniciarServidorGrpc(porta, prisma) {
  const pacote = carregarPacote();
  const servidor = new grpc.Server();

  servidor.addService(pacote.Buscas.service, {
    ListarBuscasCompativeis: async (chamada, callback) => {
      const { categoria, descricao, data_encontrado: dataEncontrado } = chamada.request;
      if (
        categoria.trim().length < 2 || categoria.trim().length > 60
        || descricao.trim().length < 2 || descricao.trim().length > 500
        || !formatoData.test(dataEncontrado)
      ) {
        return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'Categoria, descrição e data precisam ser válidas.' });
      }
      const data = paraDataUtc(dataEncontrado);
      if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== dataEncontrado) {
        return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'A data informada não existe.' });
      }

      try {
        const buscas = await prisma.busca.findMany({
          where: {
            status: 'ATIVA',
            categoriaNormalizada: normalizarTexto(categoria),
            OR: [
              { dataInicio: null, dataFim: null },
              { dataInicio: { lte: data }, dataFim: { gte: data } },
            ],
          },
          orderBy: { criadoEm: 'desc' },
          take: 1000,
        });
        const compatibilidades = filtrarBuscasCompativeis(buscas, {
          categoria,
          descricao,
          dataEncontrado,
        });

        callback(null, {
          buscas: compatibilidades.map(({ busca, palavrasEmComum }) => ({
            id: busca.id,
            usuario_id: busca.usuarioId,
            categoria: busca.categoria,
            palavras_chave: busca.palavrasChave,
            data_inicio: busca.dataInicio?.toISOString().slice(0, 10) ?? '',
            data_fim: busca.dataFim?.toISOString().slice(0, 10) ?? '',
            palavras_em_comum: palavrasEmComum,
            local_perdido: busca.localPerdido ?? '',
          })),
        });
      } catch {
        callback({ code: grpc.status.UNAVAILABLE, message: 'Serviço de Buscas indisponível.' });
      }
    },
  });

  return new Promise((resolve, reject) => {
    servidor.bindAsync('0.0.0.0:' + porta, grpc.ServerCredentials.createInsecure(), (erro) => {
      if (erro) return reject(erro);
      resolve(servidor);
    });
  });
}
