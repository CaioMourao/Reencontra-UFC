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
import { prisma } from '../src/db.js';
import { gerarHashSenha } from '../src/senhas.js';

const SENHA = 'SenhaForte@123';
let base, http, grpcServidor, grpcCliente;
const criados = [];

async function criarUsuario() {
  const email = `teste-${crypto.randomUUID()}@alu.ufc.br`;
  const u = await prisma.usuario.create({
    data: { nome: 'Pessoa Teste', email, senhaHash: await gerarHashSenha(SENHA) },
  });
  criados.push(u.id);
  return u;
}

function login(email, senha) {
  return fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  });
}

function cookieDe(res) {
  return res.headers.get('set-cookie')?.split(';')[0];
}

before(async () => {
  http = criarApp().listen(0);
  base = `http://127.0.0.1:${http.address().port}`;
  const porta = 50000 + Math.floor(Math.random() * 1000);
  grpcServidor = await iniciarServidorGrpc(porta);

  const aqui = path.dirname(fileURLToPath(import.meta.url));
  const def = protoLoader.loadSync(path.resolve(aqui, '../../../proto/auth.proto'), { keepCase: true, defaults: true });
  const { Autenticacao } = grpc.loadPackageDefinition(def).reencontra.auth;
  grpcCliente = new Autenticacao(`127.0.0.1:${porta}`, grpc.credentials.createInsecure());
});

after(async () => {
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

test('duas abas renovando juntas não derrubam a sessão', async () => {
  const u = await criarUsuario();
  const cookie = cookieDe(await login(u.email, SENHA));
  const renovar = () => fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: cookie } });
  const [a, b] = await Promise.all([renovar(), renovar()]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  // E as duas abas continuam conseguindo renovar depois
  const proxA = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: cookieDe(a) } });
  const proxB = await fetch(`${base}/auth/refresh`, { method: 'POST', headers: { Cookie: cookieDe(b) } });
  assert.equal(proxA.status, 200);
  assert.equal(proxB.status, 200);
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

test('limite por IP bloqueia muitas tentativas de login', async () => {
  let status;
  for (let i = 0; i < 12; i++) {
    status = (await login(`x${i}@alu.ufc.br`, 'errada')).status;
    if (status === 429) break;
  }
  assert.equal(status, 429);
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
