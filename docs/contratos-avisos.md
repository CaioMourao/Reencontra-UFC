# Contrato do serviço de Avisos

## Consumo RabbitMQ

O consumidor declara a exchange topic durável `achados.eventos`, a fila durável `avisos.q` e os bindings `correspondencia.sugerida`, `contato.solicitado`, `contato.mensagem_enviada` e `contato.codigo_retirada_renovado`. Os eventos de correspondência seguem o contrato descrito em [contratos-correspondencias.md](contratos-correspondencias.md); `contato.solicitado` e `contato.codigo_retirada_renovado` persistem avisos para o autor do anúncio. A coluna `event_id` única torna a persistência idempotente caso o ACK se perca e o RabbitMQ reentregue a mensagem.

O evento `contato.mensagem_enviada` não cria um aviso persistente: ele atualiza as conexões WebSocket ativas do destinatário. O histórico e a contagem de mensagens não lidas vêm da API autenticada de Publicações.

Eventos inválidos são encaminhados com confirmação para `avisos.erros.q`, preservando o corpo e incluindo a routing key e o motivo de descarte nos headers. Falhas temporárias do banco deixam o evento sem confirmação durante uma espera crescente e depois fazem requeue.

## REST autenticado

Todas as rotas `/avisos` exigem Bearer token validado pelo serviço de Autenticação via gRPC. As consultas e alterações sempre filtram por `usuario_id` do token; IDs de outros usuários não permitem leitura nem alteração.

- `GET /avisos?pagina=1&porPagina=20&naoLidos=true|false`: lista paginada e contagem de não lidos.
- `GET /avisos/resumo`: contagem de não lidos.
- `PATCH /avisos/:id/lida`: marca um aviso como lido.
- `PATCH /avisos/lidas`: marca todos os avisos do usuário como lidos.

## WebSocket autenticado

O endpoint interno é `/ws`, exposto pelo Nginx/Vite em `/ws/avisos`. Após abrir a conexão, o navegador envia uma única mensagem JSON `{"type":"auth","token":"<access token>"}`. O serviço valida o token por gRPC; mensagens `{"type":"aviso","aviso":{...}}` e `{"type":"mensagem","mensagem":{...}}` são enviadas apenas às conexões do usuário de destino. O token não aparece no URL e o servidor fecha a conexão na expiração do JWT (15 minutos por padrão). O cliente atualiza a conexão usando o cookie httpOnly de renovação.

## Persistência

O banco próprio `avisos_db` guarda avisos de correspondência, nova solicitação de contato e renovação do código de retirada. Os campos específicos de cada tipo ficam vazios quando não se aplicam. `ANUNCIO_REABERTO` identifica quando o anúncio voltou a ficar ativo; eventos sem esse campo são tratados como `NOVA_CORRESPONDENCIA` para manter compatibilidade. Não há chave estrangeira entre bancos, nem dados de contato ou o código de retirada.
