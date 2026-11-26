# Contratos do serviço de Buscas

## REST

Todas as rotas REST, exceto GET /health, exigem Authorization: Bearer JWT.
O serviço valida o token chamando ValidarToken por gRPC na Autenticação.
Cada operação de usuário consulta apenas buscas cujo usuario_id corresponda
ao usuário autenticado.

### GET /buscas

Lista as buscas do usuário autenticado. Aceita:

- q: procura termos em comum entre categoria e palavras-chave;
- categoria: filtra pela categoria;
- status: ATIVA, ARQUIVADA ou TODAS (padrão ATIVA);
- pagina e porPagina para paginação (padrão 1 e 12; máximo 50).

A resposta tem itens, pagina, porPagina, total e temProxima.

### POST /buscas

Cria uma busca com categoria, ao menos uma palavra-chave, local perdido
opcional e período opcional. O período deve conter as duas datas e não pode
terminar no futuro.
Uma busca nova recebe status ATIVA.

### GET /buscas/:id

Retorna a busca se ela pertencer ao usuário autenticado; caso contrário retorna
404.

### PATCH /buscas/:id

Atualiza os campos editáveis de uma busca ativa. Recebe o mesmo corpo de
POST /buscas.

### POST /buscas/:id/arquivar

Arquiva a busca. Busca arquivada não participa de novas correspondências.

### POST /buscas/:id/desarquivar

Reativa uma busca arquivada e limpa o campo `arquivadaEm`.

## gRPC interno

O serviço reencontra.buscas.Buscas expõe
ListarBuscasCompativeis(categoria, descricao, data_encontrado).
Retorna buscas ativas da mesma categoria, dentro do período informado quando
ele existir, e com ao menos uma palavra-chave em comum com a descrição do
objeto publicado. Cada resultado contém o id da busca, id do dono, palavras
em comum e os critérios salvos, incluindo o local perdido quando informado.
A chamada é interna à rede do Docker e será usada pelo serviço de Correspondências.
