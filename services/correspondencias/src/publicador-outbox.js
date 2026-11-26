import amqp from 'amqplib';
import { config } from './config.js';

function aguardar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function iniciarPublicadorOutbox(prisma) {
  let encerrando = false;
  let pronto = false;
  let conexao;
  let canal;
  let acordar;

  async function conectar() {
    if (canal) return;
    conexao = await amqp.connect(config.RABBITMQ_URL, { timeout: 5000 });
    conexao.on('error', () => {});
    conexao.on('close', () => { canal = undefined; conexao = undefined; pronto = false; });
    canal = await conexao.createConfirmChannel();
    await canal.assertExchange(config.RABBITMQ_EXCHANGE, 'topic', { durable: true });
    pronto = true;
  }

  async function publicar(evento) {
    let semRota = false;
    const aoRetornar = () => { semRota = true; };
    canal.on('return', aoRetornar);
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timeout na confirmação do RabbitMQ.')), 10000);
        try {
          canal.publish(config.RABBITMQ_EXCHANGE, evento.tipo, Buffer.from(JSON.stringify({
            eventId: evento.id,
            eventType: evento.tipo,
            occurredAt: evento.criadoEm.toISOString(),
            data: evento.payload,
          })), {
            contentType: 'application/json',
            deliveryMode: 2,
            messageId: evento.id,
            timestamp: Math.floor(evento.criadoEm.getTime() / 1000),
            type: evento.tipo,
            mandatory: true,
          }, (erro) => {
            clearTimeout(timer);
            erro ? reject(erro) : resolve();
          });
        } catch (erro) {
          clearTimeout(timer);
          reject(erro);
        }
      });
      if (semRota) throw new Error('Nenhuma fila RabbitMQ está vinculada ao evento.');
    } finally {
      canal.removeListener('return', aoRetornar);
    }
  }

  async function fecharConexao() {
    const canalAtual = canal;
    const conexaoAtual = conexao;
    canal = undefined;
    conexao = undefined;
    pronto = false;
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
        if (!eventos.length) {
          await new Promise((resolve) => {
            const timer = setTimeout(resolve, config.OUTBOX_INTERVAL_MS);
            acordar = () => { clearTimeout(timer); resolve(); };
          });
          acordar = undefined;
          continue;
        }

        for (const evento of eventos) {
          if (encerrando) break;
          try {
            await publicar(evento);
            await prisma.outboxEvento.update({ where: { id: evento.id }, data: { publicadoEm: new Date() } });
          } catch {
            const tentativas = evento.tentativas + 1;
            const esperaMs = Math.min(60000, 1000 * 2 ** Math.min(tentativas, 6));
            await prisma.outboxEvento.update({
              where: { id: evento.id },
              data: { tentativas, proximaTentativa: new Date(Date.now() + esperaMs) },
            });
            throw new Error('Não foi possível publicar a outbox de correspondências.');
          }
        }
      } catch {
        if (!encerrando) console.error('[correspondencias] Falha no publicador RabbitMQ; eventos mantidos na outbox.');
        await fecharConexao();
        if (!encerrando) await aguardar(config.RABBITMQ_RETRY_MS);
      }
    }
    await fecharConexao();
  }

  const trabalho = executar();
  return {
    estaPronto: () => pronto,
    async parar() {
      encerrando = true;
      acordar?.();
      await trabalho;
    },
  };
}
