# Reencontra

Plataforma de achados e perdidos do campus da UFC Crateús, em microsserviços.

## O que já está pronto

| Parte | Pasta | Situação |
|---|---|---|
| Contrato gRPC da Autenticação | `proto/auth.proto` | pronto |
| Serviço de Autenticação (login, JWT, gRPC `ValidarToken`) | `services/autenticacao` | login e cadastro prontos |
| Middleware para os outros serviços validarem o JWT | `shared/auth-grpc-middleware.js` | pronto |
| Serviço de Publicações (REST, gRPC ObterPublicacao, PostgreSQL e eventos) | services/publicacoes | pronto nesta branch |
| Serviço de Buscas (REST, gRPC ListarBuscasCompativeis e PostgreSQL) | services/buscas | pronto nesta branch |
| Contratos gRPC de Publicações e Buscas | proto | prontos nesta branch |
| Aplicativo web (React + PrimeReact): login, publicações e buscas | web | pronto nesta branch |
| Correspondências, Avisos e seus consumidores RabbitMQ | – | a fazer |

## Como rodar

### Opção 1: Docker Compose (tudo junto)

```bash
cp .env.example .env
# gere valores próprios para JWT_SECRET, AUTH_DB_PASSWORD, PUBLICACOES_DB_PASSWORD,
# BUSCAS_DB_PASSWORD, RABBITMQ_PASSWORD e PUBLICACOES_CODE_SECRET
# (comandos no próprio .env.example)
docker compose up --build
# em outro terminal, cria o usuário de teste:
docker compose exec autenticacao node prisma/seed.js
```

Abra http://localhost:8080 e entre com `teste@alu.ufc.br` / `Reencontra@2026`.
O painel local do RabbitMQ fica em http://localhost:15672 e usa `RABBITMQ_USER` / `RABBITMQ_PASSWORD` do `.env`.

### Opção 2: desenvolvimento (com recarga automática)

Precisa de Node 22 e de um PostgreSQL rodando.

```bash
# 1. Serviço de Autenticação
cd services/autenticacao
cp .env.example .env          # ajuste DATABASE_URL e preencha JWT_SECRET (comando no arquivo)
npm install                   # também gera o cliente do Prisma
npm run db:deploy             # cria as tabelas
npm run seed                  # cria o usuário de teste
npm run dev                   # REST em :3001, gRPC em :50051
npm test                      # testes de integração (usam o banco do .env)

# 2. Aplicativo web (outro terminal)
cd web
npm install
npm run dev                   # http://localhost:5173

# 3. Serviço de Publicações (outro terminal)
cd services/publicacoes
cp .env.example .env          # ajuste o banco, o gRPC da Autenticação e o RabbitMQ
npm install
npm run db:generate
npm run db:deploy
npm run dev                   # REST em :3002, gRPC em :50052
```

## API de Autenticação

O navegador chama `/api/auth/...` e `/api/publicacoes/...`. Vite e Nginx encaminham as chamadas aos serviços correspondentes.

| Método e rota | O que faz |
|---|---|
| POST /auth/recuperar-senha | Solicita um link de redefinição; responde sem revelar se o e-mail existe |
| POST /auth/redefinir-senha | Define uma nova senha usando o token de uso único |
| `POST /auth/cadastro` | Recebe nome, e-mail e senha; cria a conta e inicia sessão |
| `POST /auth/login` | Recebe `{ email, senha }`. Devolve `{ accessToken, usuario }` e grava o cookie de refresh |
| `POST /auth/refresh` | Usa o cookie para gerar um novo access token (e troca o cookie) |
| `POST /auth/logout` | Encerra a sessão (revoga o refresh token) |
| `GET /auth/me` | Rota protegida: devolve o usuário do token |
| gRPC `ValidarToken(token)` | Para os outros serviços: devolve `valido`, `usuario_id`, `email`, `nome` |

## Serviço de Publicações

O navegador chama `/api/publicacoes/...`; Vite e Nginx encaminham para o serviço em `/publicacoes/...`. Todas as rotas REST exigem JWT no cabeçalho `Authorization: Bearer ...`, validado por gRPC na Autenticação. Publicações mantém `publicacoes_db`, sem chave estrangeira para o banco de usuários.

| Método e rota | O que faz |
|---|---|
| `GET /publicacoes` | Lista anúncios abertos; aceita `q`, `categoria`, `de`, `ate`, `pagina` e `porPagina` |
| `GET /publicacoes?minhas=true` | Lista as publicações do usuário, inclusive encerradas; pode filtrar `status` por `ABERTA`, `ARQUIVADA` ou `DEVOLVIDA` |
| `POST /publicacoes` | Cria anúncio com categoria, descrição breve, local aproximado e data encontrada; gera referência `REN-AAAA-XXXXXXXX` |
| `GET /publicacoes/:id` | Consulta anúncio aberto; os encerrados só ficam visíveis ao autor |
| `PATCH /publicacoes/:id` | O autor atualiza campos enquanto o anúncio estiver aberto |
| `POST /publicacoes/:id/contatos` | Solicita contato pela plataforma; devolve um código de retirada de uso único, válido por 24 horas |
| `GET /publicacoes/:id/contatos` | O autor consulta solicitações ativas sem dados de contato do solicitante |
| `POST /publicacoes/:id/arquivar` | O autor encerra o anúncio sem registrar devolução |
| `POST /publicacoes/:id/desarquivar` | O autor reabre um anúncio arquivado |
| `POST /publicacoes/:id/devolucao` | O autor confirma o código e registra a devolução; o anúncio é encerrado |
| gRPC `ObterPublicacao(id)` | Uso interno de Correspondências; devolve os dados necessários à comparação |

Telefone e e-mail não são armazenados nem devolvidos pelas rotas de Publicações. O serviço rejeita esses dados em campos de texto para manter o contato dentro da plataforma. Códigos de retirada não ficam salvos em texto puro: o banco recebe apenas um HMAC com segredo separado.

A descrição exige pelo menos 10 caracteres, categoria pelo menos 2 e local aproximado pelo menos 3; a data não pode estar no futuro. Toda publicação precisa ter uma foto JPG, PNG ou WebP de até 5 MB. Ao editar, a foto atual é mantida se não for substituída. A imagem é validada no servidor e guardada no volume persistente `publicacoes-arquivos`; a entidade `Publicacao` guarda somente o nome aleatório do arquivo e o tipo MIME. Não há uma entidade de foto separada porque cada publicação aceita uma única imagem.

O banco de Publicações possui três entidades: `Publicacao` (anúncio e estado), `SolicitacaoContato` (pedidos de contato e código de retirada em hash) e `OutboxEvento` (eventos a publicar no RabbitMQ). `usuarioId` é uma referência lógica à Autenticação, sem chave estrangeira entre bancos.

## Serviço de Buscas

O serviço mantém o banco independente buscas_db. Cada busca pertence ao usuário autenticado e guarda categoria, palavras-chave, local perdido opcional e um período aproximado opcional. O serviço valida o JWT com a Autenticação por gRPC.

| Método e rota | O que faz |
|---|---|
| GET /buscas | Lista as buscas do usuário; aceita q, categoria, status, pagina e porPagina |
| POST /buscas | Registra categoria, palavras-chave, local perdido opcional e, opcionalmente, as datas inicial e final do período |
| GET /buscas/:id | Consulta uma busca própria |
| PATCH /buscas/:id | Atualiza uma busca ativa |
| POST /buscas/:id/arquivar | Arquiva a busca para removê-la de futuras correspondências |
| POST /buscas/:id/desarquivar | Reativa uma busca arquivada |
| gRPC ListarBuscasCompativeis | Uso interno de Correspondências; recebe categoria, descrição e data da publicação |

O RPC devolve buscas ativas da mesma categoria, compatíveis com o período informado e com ao menos uma palavra-chave em comum com a descrição do objeto. Cada resultado inclui o id do dono, o local perdido quando informado e os termos coincidentes para o serviço de Correspondências.

O serviço cria os eventos na mesma transação dos dados usando uma outbox. O publicador entrega mensagens persistentes ao exchange topic `achados.eventos`. Os contratos e bindings estão em [`docs/contratos-publicacoes.md`](docs/contratos-publicacoes.md). Consumidores devem deduplicar pelo `eventId`, pois uma confirmação do RabbitMQ pode ser reenviada se o serviço cair antes de marcar a outbox como publicada.

## Como proteger as rotas dos outros serviços

Cada serviço valida o JWT perguntando à Autenticação por gRPC. Publicações já usa `shared/auth-grpc-middleware.js`; os próximos serviços devem reutilizar o mesmo middleware, instalar `@grpc/grpc-js` e `@grpc/proto-loader`, e usar:

```js
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { criarMiddlewareAuth } from './auth-grpc-middleware.js';

const exigirAutenticacao = criarMiddlewareAuth({
  endereco: process.env.AUTH_GRPC_URL,   // no Compose: "autenticacao:50051"
  protoPath: '/app/proto/auth.proto',
  grpc,
  protoLoader,
});

app.post('/publicacoes', exigirAutenticacao, (req, res) => {
  // req.usuario = { id, email, nome }
});
```

Sem token ou com token inválido, a resposta é 401. Se a Autenticação estiver fora do ar, é 503: o acesso é negado, nunca liberado.

No front, as telas novas entram dentro de `<Route element={<RotaProtegida />}>` em `web/src/App.jsx`. As chamadas usam `api()` de `web/src/api.js`, que já põe o token e renova a sessão sozinho.

A tela em /login alterna entre entrar e criar conta. O cadastro abre a sessão automaticamente. Nome, e-mail e senha são validados no navegador e no serviço; a senha exige 8 a 128 caracteres, uma letra e um número. Os e-mails são normalizados em minúsculas. O limite de cadastro é de cinco tentativas por IP por hora. E-mail já utilizado retorna 409. Como não há confirmação por e-mail neste protótipo, essa resposta pode revelar se o endereço tem conta; em produção, confirme o endereço por link. A variável ALLOWED_EMAIL_DOMAINS pode restringir domínios e fica vazia por padrão.

A recuperação usa o Resend. Configure RESEND_API_KEY e EMAIL_FROM no .env; o remetente precisa pertencer a um domínio verificado no Resend. APP_BASE_URL define o endereço incluído no link: use http://localhost:8080 no Docker Compose ou http://localhost:5173 com o Vite local. O link expira em 30 minutos, só pode ser usado uma vez e invalida as sessões anteriores. Sem a configuração do provedor, a API responde 503. Se o provedor rejeitar o envio, a resposta continua genérica para não revelar quais e-mails têm conta; o serviço registra um aviso sem incluir endereço ou token.

## Decisões de segurança

**Senhas**
- Guardadas com bcrypt (custo 12). Nunca são devolvidas nem registradas em log.

**Tokens**
- **Access token (JWT)**: dura 15 minutos e é assinado com HS256. Na verificação, o algoritmo, o emissor (`iss`) e o público (`aud`) são fixos, o que bloqueia tokens com `alg: none` ou assinados com outra chave. O front guarda o token só em memória, nunca em `localStorage`, onde um script malicioso (XSS) conseguiria lê-lo.
- **Refresh token**:
  - É um valor aleatório num cookie `HttpOnly`, `SameSite=Strict`, `Secure` em produção e restrito a `/api/auth`. Isso protege contra XSS e CSRF.
  - No banco fica só o hash SHA-256 do token.
  - É **trocado a cada uso** (rotação). Se um token já usado reaparecer, a sessão inteira é derrubada (detecção de roubo). Há uma tolerância de 10 segundos para duas abas que renovam ao mesmo tempo.

**Força bruta**
- Limite de 10 tentativas de login erradas por IP a cada 15 minutos.
- A conta fica bloqueada por 15 minutos depois de 5 senhas erradas.

**Não revelar quem tem conta**
- E-mail inexistente e senha errada dão a mesma mensagem.
- As duas respostas também levam o mesmo tempo, porque o bcrypt roda mesmo quando o e-mail não existe.

**Entrada**
- O JSON é validado com zod e o corpo da requisição é limitado a 10 KB.
- Os erros internos nunca chegam ao cliente.

**Cabeçalhos**
- `helmet` no serviço. No Nginx: CSP, `X-Frame-Options`, `nosniff` e `Referrer-Policy`.

**Infraestrutura**
- O serviço não sobe com um `JWT_SECRET` de menos de 32 caracteres.
- Os bancos e portas gRPC não são publicados fora da rede interna, exceto a porta local de desenvolvimento de Publicações em `127.0.0.1:5433`. O RabbitMQ e seu painel são vinculados somente a `127.0.0.1`.
- Os contêineres de Autenticação e Publicações rodam sem root.
- Os arquivos `.env` estão no `.gitignore`.

**Limitações conhecidas (é um protótipo)**
- O gRPC interno não usa TLS. Ele depende de a rede do Docker ser fechada.
- O limite por IP fica na memória: zera quando o serviço reinicia e não é compartilhado entre réplicas.
- A conta bloqueada responde 429, e um e-mail inexistente nunca recebe esse 429 do bloqueio. Quem errar a senha 5 vezes descobre que o e-mail tem conta (custa ~6 tentativas por e-mail, dentro do limite por IP).
- O logout revoga o refresh token, mas o access token já emitido continua valendo até expirar (no máximo 15 minutos).
- A CLI do Prisma 7 tem alertas do `npm audit` em dependências usadas só nos comandos de migração. Eles não fazem parte do caminho das requisições.

## Tecnologias

Node.js 22, Express 5, Prisma 7 com PostgreSQL 16 (um banco por serviço), gRPC (@grpc/grpc-js), RabbitMQ 3 (amqplib), jsonwebtoken, bcrypt, zod, helmet, express-rate-limit e, no front, React 19, Vite, React Router e PrimeReact 10.
