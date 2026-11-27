import amqp from 'amqplib';
import { config } from './config.js';
import { dadosAviso, lerEventoAviso } from './eventos.js';

const FILA = 'avisos.q';
const FILA_ERROS = 'avisos.erros.q';

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function confirmarPublicacao(canal, fila, corpo, opcoes = {}) {
  return new Promise((resolve, reject) => {
    try {
      canal.sendToQueue(fila, corpo, opcoes, (erro) => erro ? reject(erro) : resolve());
    } catch (erro) {
      reject(erro);
    }
  });
}

export function iniciarConsumidor(prisma, notificadores) {
  let encerrando = false;
  let pronto = false;
  let conexao;
  let canal;
  let tagConsumidor;
  const tarefas = new Set();
  const tentativas = new Map();

  async function descartarMensagem(message, erro) {
    await confirmarPublicacao(canal, FILA_ERROS, message.content, {
      contentType: message.properties.contentType ?? 'application/octet-stream',
      deliveryMode: 2,
      type: message.properties.type,
      messageId: message.properties.messageId,
      headers: {
        ...(message.properties.headers ?? {}),
        originalRoutingKey: message.fields.routingKey,
        motivoDescarte: erro.message.slice(0, 300),
      },
    });
    canal.ack(message);
  }

  async function tratarMensagem(message) {
    let evento;
    try {
      evento = lerEventoAviso(message);
    } catch (erro) {
      await descartarMensagem(message, erro);
      console.error('[avisos] Mensagem inválida movida para a fila de erros.');
      return;
    }

    try {
      if (evento.eventType === 'contato.mensagem_enviada') {
        notificadores.notificarMensagem(evento.data.destinatarioId, evento.data);
        canal.ack(message);
        tentativas.delete(evento.eventId);
        return;
      }
      const aviso = await prisma.aviso.create({ data: dadosAviso(evento) });
      canal.ack(message);
      tentativas.delete(evento.eventId);
      notificadores.notificar(aviso.usuarioId, aviso);
      console.log(`[avisos] Aviso ${aviso.tipo} de ${aviso.referencia} registrado para o usuário ${aviso.usuarioId}.`);
    } catch (erro) {
      // O evento pode ser reenviado se o ACK se perder depois da gravação.
      if (erro.code === 'P2002') {
        canal.ack(message);
        tentativas.delete(evento.eventId);
        return;
      }
      const numero = (tentativas.get(evento.eventId) ?? 0) + 1;
      tentativas.set(evento.eventId, numero);
      const espera = Math.min(30000, config.RABBITMQ_RETRY_MS * 2 ** Math.min(numero - 1, 4));
      const codigoErro = erro.code ?? erro.name ?? 'Erro desconhecido';
      console.error(`[avisos] Falha ao persistir evento ${evento.eventId} (${codigoErro}); nova tentativa em ${espera} ms.`);
      await aguardar(espera);
      if (!encerrando && canal) canal.nack(message, false, true);
    }
  }

  function aguardarFechamento(conexaoAtual) {
    return new Promise((resolve) => {
      if (conexaoAtual.connection.stream.destroyed) return resolve();
      conexaoAtual.once('close', resolve);
    });
  }

  async function executar() {
    while (!encerrando) {
      try {
        conexao = await amqp.connect(config.RABBITMQ_URL, { timeout: 5000 });
        conexao.on('error', () => {});
        conexao.on('close', () => { pronto = false; });
        canal = await conexao.createConfirmChannel();
        await canal.assertExchange(config.RABBITMQ_EXCHANGE, 'topic', { durable: true });
        await canal.assertQueue(FILA, { durable: true });
        await canal.assertQueue(FILA_ERROS, { durable: true });
        await canal.unbindQueue(FILA, config.RABBITMQ_EXCHANGE, 'publicacao.criada');
        await canal.bindQueue(FILA, config.RABBITMQ_EXCHANGE, 'correspondencia.sugerida');
        await canal.bindQueue(FILA, config.RABBITMQ_EXCHANGE, 'contato.solicitado');
        await canal.bindQueue(FILA, config.RABBITMQ_EXCHANGE, 'contato.mensagem_enviada');
        await canal.bindQueue(FILA, config.RABBITMQ_EXCHANGE, 'contato.codigo_retirada_renovado');
        await canal.prefetch(10);
        const conexaoAtual = conexao;
        const canalAtual = canal;
        const resultado = await canal.consume(FILA, (message) => {
          if (!message) return;
          let tarefa;
          tarefa = tratarMensagem(message)
            .catch(() => {
              if (!encerrando) {
                try { canalAtual.nack(message, false, true); } catch {}
              }
            })
            .finally(() => tarefas.delete(tarefa));
          tarefas.add(tarefa);
        }, { noAck: false });
        tagConsumidor = resultado.consumerTag;
        pronto = true;
        console.log('[avisos] Consumindo avisos.q.');
        await aguardarFechamento(conexaoAtual);
      } catch {
        pronto = false;
        if (!encerrando) console.error('[avisos] RabbitMQ indisponível; tentando reconectar.');
      }

      pronto = false;
      await Promise.allSettled([...tarefas]);
      const canalAtual = canal;
      const conexaoAtual = conexao;
      canal = undefined;
      conexao = undefined;
      tagConsumidor = undefined;
      try { await canalAtual?.close(); } catch {}
      try { await conexaoAtual?.close(); } catch {}
      if (!encerrando) await aguardar(config.RABBITMQ_RETRY_MS);
    }
  }

  const trabalho = executar();
  return {
    estaPronto: () => pronto,
    async parar() {
      encerrando = true;
      try { if (tagConsumidor && canal) await canal.cancel(tagConsumidor); } catch {}
      try { await canal?.close(); } catch {}
      try { await conexao?.close(); } catch {}
      await trabalho;
    },
  };
}
