# Reencontra

Plataforma de achados e perdidos do campus da UFC Crateús, em microsserviços.

## O que já está pronto

| Parte | Pasta | Situação |
|---|---|---|
| Contrato gRPC da Autenticação | `proto/auth.proto` | pronto |
| Serviço de Autenticação (login, JWT, gRPC `ValidarToken`) | `services/autenticacao` | login pronto; cadastro é o próximo passo |
| Middleware para os outros serviços validarem o JWT | `shared/auth-grpc-middleware.js` | pronto |
| Aplicativo web (React + PrimeReact): tela de login e rotas protegidas | `web` | pronto |
| Publicações, Buscas, Correspondências, Avisos, RabbitMQ | – | a fazer |

## Como rodar

### Opção 1: Docker Compose (tudo junto)

```bash
cp .env.example .env
# preencha JWT_SECRET e AUTH_DB_PASSWORD (os comandos para gerar estão no próprio .env.example;
# a senha do banco precisa ser só letras e números, porque entra na DATABASE_URL)
docker compose up --build
# em outro terminal, cria o usuário de teste:
docker compose exec autenticacao node prisma/seed.js
```

Abra http://localhost:8080 e entre com `teste@alu.ufc.br` / `Reencontra@2026`.

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
```

## API de Autenticação

O navegador sempre chama `/api/auth/...`. O proxy (Vite em dev, Nginx no Docker) repassa para `/auth/...` no serviço.

| Método e rota | O que faz |
|---|---|
| `POST /auth/login` | Recebe `{ email, senha }`. Devolve `{ accessToken, usuario }` e grava o cookie de refresh |
| `POST /auth/refresh` | Usa o cookie para gerar um novo access token (e troca o cookie) |
| `POST /auth/logout` | Encerra a sessão (revoga o refresh token) |
| `GET /auth/me` | Rota protegida: devolve o usuário do token |
| gRPC `ValidarToken(token)` | Para os outros serviços: devolve `valido`, `usuario_id`, `email`, `nome` |

## Como proteger as rotas dos outros serviços

Cada serviço valida o JWT perguntando à Autenticação por gRPC. Copie `shared/auth-grpc-middleware.js` para o seu serviço, instale `@grpc/grpc-js` e `@grpc/proto-loader`, e use:

```js
import { criarMiddlewareAuth } from './auth-grpc-middleware.js';

const exigirAutenticacao = criarMiddlewareAuth({
  endereco: process.env.AUTH_GRPC_URL,   // no Compose: "autenticacao:50051"
  protoPath: '/app/proto/auth.proto',
});

app.post('/publicacoes', exigirAutenticacao, (req, res) => {
  // req.usuario = { id, email, nome }
});
```

Sem token ou com token inválido, a resposta é 401. Se a Autenticação estiver fora do ar, é 503: o acesso é negado, nunca liberado.

No front, as telas novas entram dentro de `<Route element={<RotaProtegida />}>` em `web/src/App.jsx`. As chamadas usam `api()` de `web/src/api.js`, que já põe o token e renova a sessão sozinho.

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
- O banco e a porta gRPC não são publicados fora da rede do Docker, e o contêiner da Autenticação roda sem root.
- Os arquivos `.env` estão no `.gitignore`.

**Limitações conhecidas (é um protótipo)**
- O gRPC interno não usa TLS. Ele depende de a rede do Docker ser fechada.
- O limite por IP fica na memória: zera quando o serviço reinicia e não é compartilhado entre réplicas.
- A conta bloqueada responde 429, e um e-mail inexistente nunca recebe esse 429 do bloqueio. Quem errar a senha 5 vezes descobre que o e-mail tem conta (custa ~6 tentativas por e-mail, dentro do limite por IP).
- O logout revoga o refresh token, mas o access token já emitido continua valendo até expirar (no máximo 15 minutos).
- A CLI do Prisma 7 tem alertas do `npm audit` em dependências usadas só nos comandos de migração. Eles não fazem parte do caminho das requisições.

## Tecnologias

Node.js 22, Express 5, Prisma 7 com PostgreSQL 16, jsonwebtoken, bcrypt, zod, helmet, express-rate-limit, gRPC (@grpc/grpc-js) e, no front, React 19, Vite, React Router e PrimeReact 10.
