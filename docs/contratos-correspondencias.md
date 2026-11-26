# Contrato do serviço de Correspondências

## Responsabilidade

O serviço consome eventos do exchange `achados.eventos`, consulta Publicações e Buscas por gRPC e registra, no banco próprio `correspondencias_db`, os pares compatíveis. Cada par publicação/busca é único. O processamento deduplica `eventId`, pois as mensagens são entregues pelo menos uma vez.

O serviço não expõe rotas de usuário. `GET /health` verifica o PostgreSQL e as conexões com RabbitMQ. O serviço Avisos recebe eventos de saída pela fila `avisos.q`.

## Eventos consumidos

A fila durável `correspondencias.q` recebe:

| Routing key | Ação |
|---|---|
| `publicacao.criada` | Busca critérios compatíveis e registra novas correspondências. |
| `publicacao.atualizada` | Recalcula as correspondências da publicação; pares que deixaram de combinar passam para `INCOMPATIVEL`. |
| `publicacao.reaberta` | Recalcula e reativa pares compatíveis anteriormente arquivados ou incompatíveis. |
| `publicacao.arquivada` | Marca como `ARQUIVADA` as correspondências daquela publicação. |
| `devolucao.concluida` | Marca como `DEVOLVIDA` as correspondências daquela publicação. |

Eventos malformados são copiados para a fila durável `correspondencias.erros.q`. Falhas temporárias de gRPC ou banco deixam a mensagem sem confirmação e iniciam nova tentativa com espera crescente.

## Consultas internas

Para eventos de criação, atualização ou reabertura, o serviço chama:

- `reencontra.publicacoes.Publicacoes.ObterPublicacao(publicacaoId)` para obter os dados atuais de uma publicação aberta;
- `reencontra.buscas.Buscas.ListarBuscasCompativeis(categoria, descricao, data_encontrado)` para obter buscas ativas com categoria, período e palavras-chave compatíveis.

Buscas pertencentes ao mesmo usuário que publicou o objeto são descartadas. E-mails e telefones não são solicitados nem armazenados.

## Eventos publicados

Uma correspondência nova ou reativada é publicada como `correspondencia.sugerida`, entregue ao exchange `achados.eventos` e roteada para `avisos.q`:

```json
{
  "eventId": "uuid",
  "eventType": "correspondencia.sugerida",
  "occurredAt": "2026-11-27T12:00:00.000Z",
  "data": {
    "correspondenciaId": "uuid",
    "usuarioId": "id-do-dono-da-busca",
    "publicacaoId": "uuid",
    "buscaId": "uuid",
    "referencia": "REN-2026-ABC12345",
    "categoria": "Eletrônicos",
    "palavrasEmComum": ["fone", "preto"],
    "localPerdido": "Biblioteca"
  }
}
```

O `usuarioId` de destino é o dono da busca. O local perdido vai apenas para esse destinatário por meio da fila interna de Avisos. A outbox grava a sugestão na mesma transação que a correspondência e tenta publicar até receber confirmação do RabbitMQ.

## Estados de correspondência

- `ATIVA`: publicação aberta e busca compatível;
- `ARQUIVADA`: publicação arquivada;
- `DEVOLVIDA`: devolução confirmada;
- `INCOMPATIVEL`: uma atualização deixou de atender aos critérios da busca.

`ARQUIVADA` pode voltar a `ATIVA` quando a publicação for reaberta e a compatibilidade ainda existir. `DEVOLVIDA` é terminal.
