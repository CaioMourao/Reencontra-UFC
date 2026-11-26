import amqp from 'amqplib';
import { config } from './config.js';
import { lerEvento } from './eventos.js';
import { processarEventoBusca, processarEventoPublicacao } from './processador.js';

const FILA = 'correspondencias.q';
const FILA_ERROS = 'correspondencias.erros.q';

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

export function iniciarConsumidor(prisma, clientes) {
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
      evento = lerEvento(message);
    } catch (erro) {
      await descartarMensagem(message, erro);
      console.error('[correspondencias] Mensagem inválida movida para a fila de erros.');
      return;
    }

    try {
      const resultado = evento.eventType === 'busca.criada' || evento.eventType === 'busca.atualizada'
        ? await processarEventoBusca(prisma, clientes, evento)
        : await processarEventoPublicacao(prisma, clientes, evento);
      canal.ack(message);
      tentativas.delete(evento.eventId);
      console.log(`[correspondencias] Evento ${evento.eventId} processado; ${resultado.criadas ?? 0} correspondência(s) nova(s).`);
    } catch (erro) {
      const numero = (tentativas.get(evento.eventId) ?? 0) + 1;
      tentativas.set(evento.eventId, numero);
      const espera = Math.min(30000, config.RABBITMQ_RETRY_MS * 2 ** Math.min(numero - 1, 4));
      console.error(`[correspondencias] Falha ao processar evento ${evento.eventId}; nova tentativa em ${espera} ms.`);
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
        await Promise.all([
          canal.bindQueue(FILA, config.RABBITMQ_EXCHANGE, 'publicacao.criada'),
          canal.bindQueue(FILA, config.RABBITMQ_EXCHANGE, 'publicacao.atualizada'),
          canal.bindQueue(FILA, config.RABBITMQ_EXCHANGE, 'publicacao.reaberta'),
          canal.bindQueue(FILA, config.RABBITMQ_EXCHANGE, 'publicacao.arquivada'),
          canal.bindQueue(FILA, config.RABBITMQ_EXCHANGE, 'devolucao.concluida'),
          canal.bindQueue(FILA, config.RABBITMQ_EXCHANGE, 'busca.criada'),
          canal.bindQueue(FILA, config.RABBITMQ_EXCHANGE, 'busca.atualizada'),
        ]);
        await canal.prefetch(5);
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
        console.log('[correspondencias] Consumindo correspondencias.q.');
        await aguardarFechamento(conexaoAtual);
      } catch {
        pronto = false;
        if (!encerrando) console.error('[correspondencias] RabbitMQ indisponível; tentando reconectar.');
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
