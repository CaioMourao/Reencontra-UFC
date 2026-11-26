// Cliente HTTP do aplicativo.
//
// O access token fica só nesta variável (memória). Não usamos localStorage
// porque qualquer script injetado na página (XSS) conseguiria lê-lo.
// Ao recarregar a página, a sessão volta pelo cookie httpOnly de refresh.

let accessToken = null;
let renovacaoEmAndamento = null;
let aoPerderSessao = () => {};

export function definirToken(token) {
  accessToken = token;
}

export function obterAccessToken() {
  return accessToken;
}

export function aoExpirarSessao(callback) {
  aoPerderSessao = callback;
}

async function lerCorpo(res) {
  if (res.status === 204) return null;
  const tipo = res.headers.get('content-type') ?? '';
  return tipo.includes('application/json') ? res.json() : null;
}

export class ErroApi extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

/**
 * Pede um novo access token usando o cookie de refresh.
 * Se várias chamadas pedirem ao mesmo tempo, todas esperam a mesma requisição.
 * @returns {Promise<{ accessToken, usuario } | null>}
 */
export function renovarSessao() {
  if (!renovacaoEmAndamento) {
    renovacaoEmAndamento = fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const dados = await res.json();
        accessToken = dados.accessToken;
        return dados;
      })
      .catch(() => null)
      .finally(() => {
        renovacaoEmAndamento = null;
      });
  }
  return renovacaoEmAndamento;
}

/**
 * fetch com o token no cabeçalho. Se receber 401 (token expirou),
 * renova a sessão uma vez e repete a chamada.
 */
export async function api(caminho, { metodo = 'GET', corpo, tentarRenovar = true } = {}) {
  const cabecalhos = {};
  const eFormData = typeof FormData !== 'undefined' && corpo instanceof FormData;
  if (corpo !== undefined && !eFormData) cabecalhos['Content-Type'] = 'application/json';
  if (accessToken) cabecalhos.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(caminho, {
    method: metodo,
    headers: cabecalhos,
    body: corpo !== undefined ? (eFormData ? corpo : JSON.stringify(corpo)) : undefined,
    credentials: 'same-origin',
  });

  if (res.status === 401 && tentarRenovar && accessToken) {
    const nova = await renovarSessao();
    if (nova) return api(caminho, { metodo, corpo, tentarRenovar: false });
    accessToken = null;
    aoPerderSessao();
  }

  const dados = await lerCorpo(res);
  if (!res.ok) {
    throw new ErroApi(res.status, dados?.erro ?? 'Não foi possível completar a ação.');
  }
  return dados;
}

export async function apiBlob(caminho, { tentarRenovar = true } = {}) {
  const cabecalhos = {};
  if (accessToken) cabecalhos.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(caminho, {
    headers: cabecalhos,
    credentials: 'same-origin',
  });

  if (res.status === 401 && tentarRenovar && accessToken) {
    const nova = await renovarSessao();
    if (nova) return apiBlob(caminho, { tentarRenovar: false });
    accessToken = null;
    aoPerderSessao();
  }

  if (!res.ok) {
    const dados = await lerCorpo(res);
    throw new ErroApi(res.status, dados?.erro ?? 'Não foi possível carregar a imagem.');
  }
  return res.blob();
}
