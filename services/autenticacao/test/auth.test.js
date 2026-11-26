// Testes de integração: sobem a API e o gRPC de verdade contra o banco do .env.
// Rodar com: npm test
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import jwt from 'jsonwebtoken';
import { criarApp } from '../src/app.js';
import { iniciarServidorGrpc } from '../src/grpc.js';
import { config } from '../src/config.js';
import { prisma } from '../src/db.js';
import { gerarHashSenha } from '../src/senhas.js';

const SENHA = 'SenhaForte@123';
let base, http, grpcServidor, grpcCliente;
const criados = [];
const emailsEnviados = [];
let fetchOriginal;

async function criarUsuario() {
  const email = `teste-${crypto.randomUUID()}@alu.ufc.br`;
  const u = await prisma.usuario.create({
    data: { nome: 'Pessoa Teste', email, senhaHash: await gerarHashSenha(SENHA) },
  });
  criados.push(u.id);
  return u;
}

// Cada chamada usa um IP diferente (X-Forwarded-For + trust proxy no app de
// teste). Sem isso todas vinham de 127.0.0.1 e o limite por IP de um teste
// vazava para os outros: o resultado dependia da ordem dos testes.
let contadorIp = 0;
function ipNovo() {
  contadorIp++;
  return `10.0.${contadorIp >> 8}.${contadorIp & 255}`;
}

function login(email, senha, ip = ipNovo()) {
  return fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ email, senha }),
  });
}

function refresh(cookie) {
  return fetch(`${base}/auth/refresh`, {
    method: 'POST',
    headers: { 'X-Forwarded-For': ipNovo(), ...(cookie ? { Cookie: cookie } : {}) },
  });
}

function cadastro(nome, email, senha, ip = ipNovo()) {
  return fetch(base + '/auth/cadastro', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ nome, email, senha }),
  });
}

function recuperarSenha(email, ip = ipNovo()) {
  return fetch(base + '/auth/recuperar-senha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ email }),
  });
}

function redefinirSenha(token, senha, ip = ipNovo()) {
  return fetch(base + '/auth/redefinir-senha', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ token, senha }),
  });
}

function tokenDoUltimoEmail() {
  const texto = emailsEnviados.at(-1).text;
  const link = texto.match(/https?:\/\/\S+/)?.[0];
  assert.ok(link, 'o e-mail deve conter o link de redefinição');
  return new URLSearchParams(new URL(link).hash.slice(1)).get('token');
}

function cookieDe(res) {
  return res.headers.get('set-cookie')?.split(';')[0];
}

before(async () => {
  config.email.resendApiKey = 're_test';
  config.email.remetente = 'Reencontra <nao-responda@example.test>';
  fetchOriginal = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'api.resend.com' && url.pathname === '/emails') {
      emailsEnviados.push(JSON.parse(init.body));
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return fetchOriginal(input, init);
  };

  const app = criarApp();
  app.set('trust proxy', 1); // para o X-Forwarded-For de ipNovo() valer
  http = app.listen(0);
  base = `http://127.0.0.1:${http.address().port}`;
  const porta = 50000 + Math.floor(Math.random() * 1000);
  grpcServidor = await iniciarServidorGrpc(porta);

  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const def = protoLoader.loadSync(path.resolve(aqui, '../../../proto/auth.proto'), { keepCase: true, defaults: true });
  const { Autenticacao } = grpc.loadPackageDefinition(def).reencontra.auth;
  grpcCliente = new Autenticacao(`127.0.0.1:${porta}`, grpc.credentials.createInsecure());
});

after(async () => {
  globalThis.fetch = fetchOriginal;
  await prisma.usuario.deleteMany({ where: { id: { in: criados } } });
  http.close();
  grpcCliente.close();
  grpcServidor.forceShutdown();
  await prisma.$disconnect();
});

test('login correto devolve access token e cookie de refresh seguro', async () => {
  const u = await criarUsuario();
  const res = await login(u.email.toUpperCase(), SENHA); // e-mail sem diferenciar maiúsculas
  assert.equal(res.status, 200);
  const corpo = await res.json();
  assert.ok(corpo.accessToken);
  assert.equal(corpo.usuario.email, u.email);
  assert.equal(corpo.usuario.senhaHash, undefined, 'nunca devolver o hash');

  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);
  assert.match(cookie, /Path=\/api\/auth/i);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('senha errada e e-mail inexistente dão a mesma resposta', async () => {
  const u = await criarUsuario();
  const r1 = await login(u.email, 'errada');
  const r2 = await login('ninguem@alu.ufc.br', 'errada');
  assert.equal(r1.status, 401);
  assert.equal(r2.status, 401);
  assert.deepEqual(await r1.json(), await r2.json());
});

test('rota protegida /auth/me exige token válido', async () => {
  const u = await criarUsuario();
  const { accessToken } = await (await login(u.email, SENHA)).json();

  assert.equal((await fetch(`${base}/auth/me`)).status, 401);

  const ok = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).usuario.id, u.id);

  // Token adulterado (troca o payload, mantém a assinatura)
  const [h, , s] = accessToken.split('.');
  const falso = Buffer.from(JSON.stringify({ sub: 'outra-pessoa' })).toString('base64url');
  const r1 = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${h}.${falso}.${s}` } });
  assert.equal(r1.status, 401);

  // Token com alg "none"
  const semAssinatura = jwt.sign({ sub: u.id }, null, { algorithm: 'none' });
  const r2 = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${semAssinatura}` } });
  assert.equal(r2.status, 401);

  // Token assinado com outro segredo
  const outroSegredo = jwt.sign({ sub: u.id }, 'x'.repeat(40), { expiresIn: '5m' });
  const r3 = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${outroSegredo}` } });
  assert.equal(r3.status, 401);
});

test('refresh troca o token e detecta reuso de token antigo', async () => {
  const u = await criarUsuario();
  const cookie1 = cookieDe(await login(u.email, SENHA));

  const r1 = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: cookie1 } });
  assert.equal(r1.status, 200);
  const cookie2 = cookieDe(r1);
  assert.notEqual(cookie2, cookie1, 'o refresh token deve ser trocado a cada uso');

  // Simula que o reuso acontece depois da tolerância de 10 s
  await prisma.refreshToken.updateMany({
    where: { usuarioId: u.id, revogadoEm: { not: null } },
    data: { revogadoEm: new Date(Date.now() - 60_000) },
  });

  // Reusar o token antigo = possível roubo → nega e derruba a sessão inteira
  const reuso = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: cookie1 } });
  assert.equal(reuso.status, 401);
  const depois = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: cookie2 } });
  assert.equal(depois.status, 401, 'o token novo também deve ter sido revogado');
});

test('várias abas renovando juntas não derrubam a sessão', async () => {
  // Repete porque a corrida só aparece às vezes: antes da correção, ~1 em
  // cada 8 pares de renovações simultâneas devolvia 401 e apagava o cookie.
  const u = await criarUsuario();
  for (let rodada = 0; rodada < 15; rodada++) {
    const cookie = cookieDe(await login(u.email, SENHA));
    const abas = await Promise.all([refresh(cookie), refresh(cookie), refresh(cookie)]);
    for (const r of abas) assert.equal(r.status, 200, `rodada ${rodada}`);
    // E todas as abas continuam conseguindo renovar depois
    for (const r of abas) assert.equal((await refresh(cookieDe(r))).status, 200, `rodada ${rodada}`);
  }
});

test('refresh sem cookie ou com cookie desconhecido dá 401', async () => {
  assert.equal((await refresh()).status, 401);
  assert.equal((await refresh('reencontra_refresh=nao-existe')).status, 401);
});

test('logout invalida o refresh token', async () => {
  const u = await criarUsuario();
  const cookie = cookieDe(await login(u.email, SENHA));
  const sair = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(sair.status, 204);
  const r = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: cookie } });
  assert.equal(r.status, 401);
});

test('conta é bloqueada após 5 senhas erradas, mesmo com a senha certa depois', async () => {
  const u = await criarUsuario();
  for (let i = 0; i < 5; i++) assert.equal((await login(u.email, 'errada')).status, 401);
  // O 429 tem que vir do bloqueio da conta, e não do limite por IP (mesma
  // mensagem e mesmo status). Por isso confere no banco.
  const depois = await prisma.usuario.findUnique({ where: { id: u.id } });
  assert.ok(depois.bloqueadoAte > new Date(), 'a conta deveria estar bloqueada');
  assert.equal((await login(u.email, SENHA)).status, 429);
});

test('senhas erradas em paralelo também bloqueiam a conta', async () => {
  const u = await criarUsuario();
  const respostas = await Promise.all(Array.from({ length: 8 }, () => login(u.email, 'errada')));
  for (const r of respostas) assert.ok([401, 429].includes(r.status));
  assert.equal((await login(u.email, SENHA)).status, 429);
});

test('gRPC ValidarToken aceita token válido e recusa inválido', async () => {
  const u = await criarUsuario();
  const { accessToken } = await (await login(u.email, SENHA)).json();
  const chamar = (token) =>
    new Promise((ok, falha) => grpcCliente.ValidarToken({ token }, (e, r) => (e ? falha(e) : ok(r))));

  const valido = await chamar(accessToken);
  assert.equal(valido.valido, true);
  assert.equal(valido.usuario_id, u.id);

  const invalido = await chamar('abc.def.ghi');
  assert.equal(invalido.valido, false);
  assert.equal(invalido.usuario_id, '');
});

test('limite por IP bloqueia a 11ª tentativa errada (e só daquele IP)', async () => {
  const ip = ipNovo();
  for (let i = 0; i < 10; i++) {
    assert.equal((await login(`x${i}@alu.ufc.br`, 'errada', ip)).status, 401, `tentativa ${i + 1}`);
  }
  assert.equal((await login('x10@alu.ufc.br', 'errada', ip)).status, 429);
  assert.equal((await login('x11@alu.ufc.br', 'errada')).status, 401, 'outro IP não é afetado');
});

test('JSON malformado não derruba nem vaza detalhes', async () => {
  const r2 = await fetch(`${base}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{quebrado',
  });
  assert.equal(r2.status, 400);
  assert.deepEqual(await r2.json(), { erro: 'JSON inválido.' });
});

test('cadastro válido abre sessão sem devolver senha nem hash', async () => {
  const email = 'cadastro-' + crypto.randomUUID() + '@alu.ufc.br';
  const res = await cadastro('Pessoa Nova', email, 'SenhaForte123');
  assert.equal(res.status, 200);
  const corpo = await res.json();
  assert.ok(corpo.accessToken);
  assert.equal(corpo.usuario.nome, 'Pessoa Nova');
  assert.equal(corpo.usuario.email, email);
  assert.equal(corpo.usuario.senhaHash, undefined);
  assert.equal(JSON.stringify(corpo).includes('SenhaForte123'), false);
  assert.match(res.headers.get('set-cookie'), /HttpOnly/i);
  criados.push(corpo.usuario.id);
});

test('cadastro normaliza e-mail e rejeita duplicata sem diferenciar caixa', async () => {
  const email = 'cadastro-' + crypto.randomUUID() + '@alu.ufc.br';
  const primeira = await cadastro('Pessoa Nova', email.toUpperCase(), 'SenhaForte123');
  assert.equal(primeira.status, 200);
  const corpo = await primeira.json();
  criados.push(corpo.usuario.id);
  assert.equal(corpo.usuario.email, email);
  assert.equal((await cadastro('Pessoa Nova', email, 'SenhaForte123')).status, 409);
});

test('cadastro rejeita nome inválido e senha sem os requisitos', async () => {
  assert.equal((await cadastro('A', 'nome-' + crypto.randomUUID() + '@alu.ufc.br', 'SenhaForte123')).status, 400);
  assert.equal((await cadastro('Pessoa Nova', 'senha-' + crypto.randomUUID() + '@alu.ufc.br', 'somenteletras')).status, 400);
  assert.equal((await cadastro('Pessoa Nova', 'curta-' + crypto.randomUUID() + '@alu.ufc.br', 'Ab1')).status, 400);
});

test('cadastro limita a cinco tentativas por IP por hora', async () => {
  const ip = ipNovo();
  for (let i = 0; i < 5; i++) {
    const email = 'limite-' + crypto.randomUUID() + '@alu.ufc.br';
    const res = await cadastro('Pessoa Nova', email, 'SenhaForte123', ip);
    assert.equal(res.status, 200);
    criados.push((await res.json()).usuario.id);
  }
  assert.equal((await cadastro('Pessoa Nova', 'limite-' + crypto.randomUUID() + '@alu.ufc.br', 'SenhaForte123', ip)).status, 429);
});

test('recuperação não revela se o e-mail existe e envia link com token armazenado em hash', async () => {
  const antes = emailsEnviados.length;
  const inexistente = await recuperarSenha('nao-existe-' + crypto.randomUUID() + '@alu.ufc.br');
  const mensagemInexistente = await inexistente.json();
  assert.equal(inexistente.status, 202);
  assert.equal(emailsEnviados.length, antes);

  const usuario = await criarUsuario();
  const existente = await recuperarSenha(usuario.email);
  assert.equal(existente.status, 202);
  assert.deepEqual(await existente.json(), mensagemInexistente);
  assert.equal(emailsEnviados.length, antes + 1);

  const token = tokenDoUltimoEmail();
  assert.ok(token);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const salvo = await prisma.tokenRecuperacao.findUnique({ where: { tokenHash } });
  assert.ok(salvo);
  assert.equal(salvo.usuarioId, usuario.id);
  assert.notEqual(salvo.tokenHash, token);
  assert.ok(salvo.expiraEm > new Date());
});

test('redefinição aceita o token uma vez, troca a senha e revoga sessões', async () => {
  const usuario = await criarUsuario();
  const cookieAntigo = cookieDe(await login(usuario.email, SENHA));
  await recuperarSenha(usuario.email);
  const token = tokenDoUltimoEmail();
  const novaSenha = 'OutraSenha@456';

  const resposta = await redefinirSenha(token, novaSenha);
  assert.equal(resposta.status, 200);
  assert.equal((await login(usuario.email, SENHA)).status, 401);
  assert.equal((await login(usuario.email, novaSenha)).status, 200);
  assert.equal((await refresh(cookieAntigo)).status, 401);
  assert.equal((await redefinirSenha(token, 'MaisUmaSenha789')).status, 400);
});

test('redefinição recusa token inválido, expirado e senha fraca', async () => {
  const usuario = await criarUsuario();
  await recuperarSenha(usuario.email);
  const token = tokenDoUltimoEmail();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await prisma.tokenRecuperacao.update({
    where: { tokenHash },
    data: { expiraEm: new Date(Date.now() - 1000) },
  });

  assert.equal((await redefinirSenha(token, 'NovaSenha123')).status, 400);
  assert.equal((await redefinirSenha('x'.repeat(40), 'NovaSenha123')).status, 400);
  assert.equal((await redefinirSenha('x'.repeat(40), 'fraca')).status, 400);
});

test('recuperação limita solicitações por IP', async () => {
  const ip = ipNovo();
  for (let i = 0; i < 5; i++) {
    assert.equal((await recuperarSenha('desconhecido-' + i + '@alu.ufc.br', ip)).status, 202);
  }
  assert.equal((await recuperarSenha('desconhecido-6@alu.ufc.br', ip)).status, 429);
});
