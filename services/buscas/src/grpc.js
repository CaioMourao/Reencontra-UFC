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
const formatoUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
        const where = {
          status: 'ATIVA',
          categoriaNormalizada: normalizarTexto(categoria),
          OR: [
            { dataInicio: null, dataFim: null },
            { dataInicio: { lte: data }, dataFim: { gte: data } },
          ],
        };
        const buscas = await prisma.busca.findMany({
          where,
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
    ListarPublicacoesCompativeis: async (chamada, callback) => {
      const buscaId = chamada.request.busca_id?.trim() ?? '';
      const publicacoes = chamada.request.publicacoes ?? [];
      if (!formatoUuid.test(buscaId) || publicacoes.length > 100) {
        return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'Identificador da busca ou quantidade de publicações inválida.' });
      }

      const publicacoesValidadas = [];
      for (const publicacao of publicacoes) {
        const dataEncontrado = publicacao.data_encontrado;
        if (
          !formatoUuid.test(publicacao.id ?? '')
          || typeof publicacao.usuario_id !== 'string' || !publicacao.usuario_id || publicacao.usuario_id.length > 64
          || typeof publicacao.categoria !== 'string' || publicacao.categoria.trim().length < 2 || publicacao.categoria.trim().length > 60
          || typeof publicacao.descricao !== 'string' || publicacao.descricao.trim().length < 2 || publicacao.descricao.trim().length > 500
          || !formatoData.test(dataEncontrado)
        ) {
          return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'Dados de publicação inválidos.' });
        }
        const data = paraDataUtc(dataEncontrado);
        if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== dataEncontrado) {
          return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'A data da publicação não existe.' });
        }
        publicacoesValidadas.push({ ...publicacao, data_encontrado: dataEncontrado });
      }

      try {
        const busca = await prisma.busca.findFirst({ where: { id: buscaId, status: 'ATIVA' } });
        if (!busca) return callback(null, { publicacoes: [] });

        const compatibilidades = publicacoesValidadas.flatMap((publicacao) => {
          if (publicacao.usuario_id === busca.usuarioId) return [];
          return filtrarBuscasCompativeis([busca], {
            categoria: publicacao.categoria,
            descricao: publicacao.descricao,
            dataEncontrado: publicacao.data_encontrado,
          }).map(({ palavrasEmComum }) => ({
            publicacao_id: publicacao.id,
            usuario_busca_id: busca.usuarioId,
            palavras_em_comum: palavrasEmComum,
            local_perdido: busca.localPerdido ?? '',
          }));
        });
        callback(null, { publicacoes: compatibilidades });
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
