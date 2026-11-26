import { config } from './config.js';

const API_RESEND = 'https://api.resend.com/emails';

/**
 * Envia uma mensagem transacional pelo Resend.
 * A chave e o remetente ficam somente nas variáveis de ambiente.
 */
export async function enviarEmailRecuperacao({ para, link }) {
  if (!config.email.resendApiKey || !config.email.remetente) {
    throw new Error('O envio de e-mail não está configurado.');
  }

  const linkHtml = link
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
  const resposta = await fetch(API_RESEND, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + config.email.resendApiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: config.email.remetente,
      to: [para],
      subject: 'Recuperação de senha do Reencontra',
      text:
        'Recebemos uma solicitação para redefinir sua senha do Reencontra.\n\n' +
        'Abra este link em até 30 minutos para escolher uma nova senha:\n' +
        link +
        '\n\nSe você não solicitou a recuperação, ignore este e-mail.',
      html:
        '<p>Recebemos uma solicitação para redefinir sua senha do Reencontra.</p>' +
        '<p><a href="' + linkHtml + '">Criar uma nova senha</a></p>' +
        '<p>O link expira em 30 minutos. Se você não solicitou a recuperação, ignore este e-mail.</p>',
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resposta.ok) {
    throw new Error('O provedor de e-mail recusou a mensagem.');
  }
}
