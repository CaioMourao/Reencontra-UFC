export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

export function tratarErros(erro, req, res, _next) {
  if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
  if (erro.type === 'entity.too.large') return res.status(413).json({ erro: 'Requisição grande demais.' });
  if (erro.name === 'ZodError') {
    return res.status(400).json({ erro: erro.issues[0]?.message ?? 'Dados inválidos.' });
  }
  if (erro instanceof ErroHttp) return res.status(erro.status).json({ erro: erro.message });
  console.error('[avisos] ' + req.method + ' ' + req.path + ': falha interna');
  return res.status(500).json({ erro: 'Erro interno.' });
}
