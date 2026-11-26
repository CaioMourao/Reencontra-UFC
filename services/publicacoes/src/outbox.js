import amqp from 'amqplib';
import { config } from './config.js';

const FILA_CORRESPONDENCIAS = 'correspondencias.q';

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function iniciarPublicadorOutbox(prisma) {
  let encerrando = false;
  let conexao;
  let canal;
  let acordar;
  let retornoSemRota = false;

  async function conectar() {
    if (canal) return;
    conexao = await amqp.connect(config.RABBITMQ_URL, { timeout: 5000 });
    conexao.on('error', () => {});
    conexao.on('close', () => {
      canal = undefined;
      conexao = undefined;
    });
    canal = await conexao.createConfirmChannel();
    canal.on('return', () => {
      retornoSemRota = true;
    });
    await canal.assertExchange(config.RABBITMQ_EXCHANGE, 'topic', { durable: true });

    // A arquitetura define essas filas compartilhadas. Declará-las junto ao
    // broker garante que mensagens publicadas antes dos consumidores ficarem
    // prontos não desapareçam.
    await canal.assertQueue(FILA_CORRESPONDENCIAS, { durable: true });
    await canal.bindQueue(FILA_CORRESPONDENCIAS, config.RABBITMQ_EXCHANGE, 'publicacao.criada');
    await canal.bindQueue(FILA_CORRESPONDENCIAS, config.RABBITMQ_EXCHANGE, 'publicacao.atualizada');
    await canal.bindQueue(FILA_CORRESPONDENCIAS, config.RABBITMQ_EXCHANGE, 'publicacao.reaberta');
    await canal.bindQueue(FILA_CORRESPONDENCIAS, config.RABBITMQ_EXCHANGE, 'publicacao.arquivada');
    await canal.bindQueue(FILA_CORRESPONDENCIAS, config.RABBITMQ_EXCHANGE, 'devolucao.concluida');
  }

  async function publicar(evento) {
    retornoSemRota = false;
    const envelope = {
      eventId: evento.id,
      eventType: evento.tipo,
      occurredAt: evento.criadoEm.toISOString(),
      data: evento.payload,
    };
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout na confirmação do RabbitMQ.')), 10000);
      try {
        canal.publish(
          config.RABBITMQ_EXCHANGE,
          evento.tipo,
          Buffer.from(JSON.stringify(envelope)),
          {
            contentType: 'application/json',
            deliveryMode: 2,
            messageId: evento.id,
            timestamp: Math.floor(evento.criadoEm.getTime() / 1000),
            type: evento.tipo,
            mandatory: true,
          },
          (erro) => {
            clearTimeout(timer);
            erro ? reject(erro) : resolve();
          },
        );
      } catch (erro) {
        clearTimeout(timer);
        reject(erro);
      }
    });
    if (retornoSemRota) throw new Error('Nenhuma fila RabbitMQ está vinculada ao evento.');
  }

  async function fecharConexao() {
    const canalAtual = canal;
    const conexaoAtual = conexao;
    canal = undefined;
    conexao = undefined;
    try { await canalAtual?.close(); } catch {}
    try { await conexaoAtual?.close(); } catch {}
  }

  async function executar() {
    while (!encerrando) {
      try {
        await conectar();
        const eventos = await prisma.outboxEvento.findMany({
          where: { publicadoEm: null, proximaTentativa: { lte: new Date() } },
          orderBy: { criadoEm: 'asc' },
          take: 25,
        });

        if (eventos.length === 0) {
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, config.OUTBOX_INTERVAL_MS);
            acordar = () => {
              clearTimeout(timer);
              resolve();
            };
          });
          acordar = undefined;
          continue;
        }

        for (const evento of eventos) {
          if (encerrando) break;
          try {
            await publicar(evento);
            await prisma.outboxEvento.update({
              where: { id: evento.id },
              data: { publicadoEm: new Date() },
            });
          } catch (erro) {
            const tentativas = evento.tentativas + 1;
            const esperaMs = Math.min(60000, 1000 * 2 ** Math.min(tentativas, 6));
            await prisma.outboxEvento.update({
              where: { id: evento.id },
              data: {
                tentativas,
                proximaTentativa: new Date(Date.now() + esperaMs),
              },
            });
            throw erro;
          }
        }
      } catch {
        console.error('[publicacoes] RabbitMQ indisponível; os eventos permanecem na outbox.');
        await fecharConexao();
        if (!encerrando) await aguardar(5000);
      }
    }
    await fecharConexao();
  }

  const trabalho = executar();
  return async function pararPublicador() {
    encerrando = true;
    acordar?.();
    await trabalho;
  };
}
