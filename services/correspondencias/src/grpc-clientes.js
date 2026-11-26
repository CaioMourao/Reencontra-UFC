import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { config } from './config.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));

function carregarServico(caminho, pacote, nomeServico) {
  const protoPath = path.isAbsolute(caminho) ? caminho : path.resolve(aqui, caminho);
  const definicao = protoLoader.loadSync(protoPath, {
    keepCase: true,
    longs: String,
    defaults: true,
    oneofs: true,
  });
  return grpc.loadPackageDefinition(definicao)[pacote][nomeServico];
}

function chamar(cliente, metodo, requisicao) {
  return new Promise((resolve, reject) => {
    cliente[metodo](requisicao, { deadline: Date.now() + config.GRPC_TIMEOUT_MS }, (erro, resposta) => {
      erro ? reject(erro) : resolve(resposta);
    });
  });
}

export function criarClientesGrpc() {
  const Publicacoes = carregarServico(config.PUBLICACOES_PROTO_PATH, 'reencontra', 'publicacoes').Publicacoes;
  const Buscas = carregarServico(config.BUSCAS_PROTO_PATH, 'reencontra', 'buscas').Buscas;
  const publicacoes = new Publicacoes(config.PUBLICACOES_GRPC_URL, grpc.credentials.createInsecure());
  const buscas = new Buscas(config.BUSCAS_GRPC_URL, grpc.credentials.createInsecure());

  return {
    obterPublicacao: (id) => chamar(publicacoes, 'ObterPublicacao', { id }),
    listarBuscasCompativeis: (publicacao) => chamar(buscas, 'ListarBuscasCompativeis', {
      categoria: publicacao.categoria,
      descricao: publicacao.descricao,
      data_encontrado: publicacao.data_encontrado,
    }),
    fechar() {
      publicacoes.close();
      buscas.close();
    },
  };
}
