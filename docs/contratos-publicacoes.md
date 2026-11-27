# Contratos do serviço de Publicações

Este contrato segue o diagrama e a especificação do Reencontra. O serviço guarda anúncios, filtros, solicitações de contato, códigos de retirada e arquivamento. O banco `publicacoes_db` pertence somente a este serviço; `usuarioId` é uma referência lógica à Autenticação.

## REST

O navegador usa `/api/publicacoes`; o proxy encaminha para `/publicacoes` no contêiner. Todas as rotas REST são autenticadas via gRPC `Autenticacao.ValidarToken`.

| Método e rota | Acesso e comportamento |
|---|---|
| `GET /publicacoes` | Lista anúncios abertos. Filtros: `q`, `categoria`, `de`, `ate`, `pagina`, `porPagina` (máximo 50). |
| `GET /publicacoes?minhas=true` | Lista anúncios do usuário autenticado, inclusive arquivados e devolvidos. `status` pode filtrar esses estados. |
| `POST /publicacoes` | Cria com `categoria`, `descricao`, `localAproximado`, `dataEncontrado` (`AAAA-MM-DD`) e uma foto obrigatória no campo `imagem`. |
| `GET /publicacoes/:id` | Consulta anúncio aberto; anúncios encerrados só podem ser consultados pelo autor. |
| `PATCH /publicacoes/:id` | O autor atualiza campos e pode substituir a foto enviando `imagem`, enquanto o anúncio está aberto. A publicação sempre precisa manter uma foto. |
| `POST /publicacoes/:id/contatos` | Cria uma solicitação uma vez, avisa o autor e retorna o código. Chamadas seguintes para a mesma solicitação retornam seu ID para abrir o chat sem duplicar aviso nem código. |
| `GET /publicacoes/:id/contatos` | Somente o autor consulta solicitações ativas; dados de contato e identidade do solicitante não são expostos. |
| `GET /publicacoes/contatos` | Lista as conversas do usuário, seja como autor do anúncio ou como solicitante. |
| `GET /publicacoes/contatos/:solicitacaoId/mensagens` | Lista as últimas 100 mensagens e marca como lidas as mensagens recebidas pelo participante autenticado. |
| `POST /publicacoes/contatos/:solicitacaoId/mensagens` | Envia uma mensagem de até 2.000 caracteres entre os dois participantes enquanto o anúncio e a solicitação estiverem ativos. |
| `POST /publicacoes/contatos/:solicitacaoId/codigo-retirada` | Somente a pessoa solicitante gera um novo código para uma conversa ativa; invalida o anterior, expira em 24 horas e avisa o autor. Limite de cinco renovações por hora e por IP. |
| `POST /publicacoes/:id/arquivar` | Somente o autor arquiva um anúncio aberto. Solicitações pendentes são canceladas. |
| `POST /publicacoes/:id/desarquivar` | Somente o autor reabre um anúncio arquivado; devolvidos não podem ser reabertos. |
| `POST /publicacoes/:id/devolucao` | Somente o autor confirma o código de 8 dígitos; a publicação passa para `DEVOLVIDA`. |

Categorias são texto livre com 2 a 60 caracteres; descrições aceitam 10 a 500 caracteres e locais aproximados 3 a 120. A data encontrada não pode estar no futuro. O serviço recusa campos com e-mail ou telefone. Toda publicação exige uma foto JPG, PNG ou WebP de até 5 MB; na edição, a foto atual é mantida até ser substituída por outra. Referências seguem `REN-AAAA-XXXXXXXX`.

Os bytes da foto ficam no volume persistente `publicacoes-arquivos`; o banco guarda apenas um nome aleatório e o tipo MIME na própria entidade `Publicacao`.

## gRPC

`proto/publicacoes.proto` expõe `Publicacoes.ObterPublicacao(id)` para Correspondências. Retorna referência, autor (ID interno), categoria, descrição, local aproximado, data e estado. O autor nunca é retornado como e-mail ou telefone. Uma publicação fechada responde `NOT_FOUND` para evitar correspondências com anúncios encerrados.

## Eventos RabbitMQ

Exchange durable do tipo `topic`: `achados.eventos`. Todas as mensagens são JSON persistente, confirmadas pelo publisher e envelopadas assim:

```json
{
  "eventId": "uuid",
  "eventType": "publicacao.criada",
  "occurredAt": "2026-11-25T12:00:00.000Z",
  "data": {}
}
```

| Routing key | Dados em `data` | Consumidor previsto |
|---|---|---|
| `publicacao.criada` | `publicacaoId`, `referencia`, `usuarioId` | `avisos.q` e `correspondencias.q` |
| `publicacao.atualizada` | `publicacaoId`, `referencia`, `usuarioId` | `correspondencias.q` |
| `publicacao.reaberta` | `publicacaoId`, `referencia`, `usuarioId` | `correspondencias.q` |
| `publicacao.arquivada` | `publicacaoId`, `referencia`, `usuarioId` | `correspondencias.q` |
| `contato.solicitado` | `solicitacaoId`, `publicacaoId`, `referencia`, `categoria`, `solicitanteId`, `donoId` | `avisos.q` |
| `contato.mensagem_enviada` | `mensagemId`, `solicitacaoId`, `publicacaoId`, `referencia`, `destinatarioId` | `avisos.q` (notificação WebSocket) |
| `contato.codigo_retirada_renovado` | `solicitacaoId`, `publicacaoId`, `referencia`, `categoria`, `solicitanteId`, `donoId` | `avisos.q` |
| `devolucao.concluida` | `publicacaoId`, `referencia`, `donoId`, `solicitanteId` | `correspondencias.q` |

O serviço declara as filas duráveis `avisos.q` e `correspondencias.q` e vincula os eventos destinados a cada consumidor. A outbox grava o evento na mesma transação que a mudança de estado, retenta falhas do broker e inclui `eventId` estável. Consumidores devem ser idempotentes porque a entrega é pelo menos uma vez.

## Privacidade e estados

- Anúncios não possuem campos para e-mail ou telefone; esses dados nunca são enviados nos DTOs públicos.
- Códigos de retirada têm 8 dígitos, expiram em 24 horas, são exibidos ao solicitante uma única vez por geração e são armazenados como HMAC com `PUBLICACOES_CODE_SECRET`. Renovar gera um código novo, invalida o anterior e cria aviso para o autor sem incluir o código no evento.
- Mensagens são privadas para o autor do anúncio e o solicitante daquela publicação. O histórico permanece disponível após o encerramento, mas não aceita novas mensagens.
- Só o autor pode editar, arquivar ou confirmar a devolução.
- A confirmação encerra a publicação e invalida as demais solicitações de contato.
- Estados: `ABERTA`, `ARQUIVADA` e `DEVOLVIDA`.
