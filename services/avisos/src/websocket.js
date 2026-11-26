import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { WebSocketServer, WebSocket } from 'ws';
import { config } from './config.js';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const protoPath = process.env.AUTH_PROTO_PATH ?? path.resolve(aqui, '../../../proto/auth.proto');
const definicao = protoLoader.loadSync(protoPath, { keepCase: true, defaults: true });
const { Autenticacao } = grpc.loadPackageDefinition(definicao).reencontra.auth;
const cliente = new Autenticacao(config.AUTH_GRPC_URL, grpc.credentials.createInsecure());

function validarToken(token) {
  return new Promise((resolve, reject) => {
    cliente.ValidarToken({ token }, { deadline: new Date(Date.now() + 2500) }, (erro, resposta) => {
      erro ? reject(erro) : resolve(resposta);
    });
  });
}

function expiracaoToken(token) {
  try {
    const conteudo = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number(conteudo.exp) * 1000;
  } catch {
    return 0;
  }
}

export function anexarWebSocket(servidor) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
  const socketsPorUsuario = new Map();

  servidor.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws));
  });

  wss.on('connection', (ws) => {
    let usuarioId;
    const prazoAutenticacao = setTimeout(() => ws.close(4401, 'Autenticação necessária'), 5000);

    ws.once('message', async (conteudo, binario) => {
      clearTimeout(prazoAutenticacao);
      if (binario) return ws.close(4401, 'Mensagem inválida');
      let mensagem;
      try { mensagem = JSON.parse(conteudo.toString('utf8')); } catch { return ws.close(4401, 'Mensagem inválida'); }
      if (mensagem?.type !== 'auth' || typeof mensagem.token !== 'string' || mensagem.token.length > 4096) {
        return ws.close(4401, 'Autenticação necessária');
      }

      try {
        const resposta = await validarToken(mensagem.token);
        if (!resposta.valido) return ws.close(4401, 'Token inválido');
        usuarioId = resposta.usuario_id;
        if (!usuarioId) return ws.close(4401, 'Token inválido');
        const expiraEm = expiracaoToken(mensagem.token);
        if (!expiraEm || expiraEm <= Date.now()) return ws.close(4401, 'Token expirado');
        const sockets = socketsPorUsuario.get(usuarioId) ?? new Set();
        sockets.add(ws);
        socketsPorUsuario.set(usuarioId, sockets);
        ws.once('close', () => {
          sockets.delete(ws);
          if (sockets.size === 0) socketsPorUsuario.delete(usuarioId);
        });
        ws.send(JSON.stringify({ type: 'autenticado' }));
        const timerExpiracao = setTimeout(() => ws.close(4401, 'Token expirado'), Math.min(expiraEm - Date.now(), 2147483647));
        ws.once('close', () => clearTimeout(timerExpiracao));
      } catch {
        ws.close(1013, 'Autenticação indisponível');
      }
    });
  });

  return {
    notificar(usuarioId, aviso) {
      const mensagem = JSON.stringify({ type: 'aviso', aviso: {
        id: aviso.id,
        referencia: aviso.referencia,
        categoria: aviso.categoria,
        palavrasEmComum: aviso.palavrasEmComum,
        criadoEm: aviso.criadoEm,
      } });
      for (const ws of socketsPorUsuario.get(usuarioId) ?? []) {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(mensagem); } catch {}
        }
      }
    },
    parar() {
      for (const sockets of socketsPorUsuario.values()) {
        for (const ws of sockets) ws.close(1001, 'Servidor encerrando');
      }
      cliente.close();
      wss.close();
    },
  };
}
