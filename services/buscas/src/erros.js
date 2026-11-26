export class ErroHttp extends Error {
  constructor(status, mensagem) {
    super(mensagem);
    this.status = status;
  }
}

export function tratarErros(erro, req, res, _next) {
  if (erro.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'JSON inválido.' });
  }
  if (erro.type === 'entity.too.large') {
    return res.status(413).json({ erro: 'Requisição grande demais.' });
  }
  if (erro.name === 'ZodError') {
    return res.status(400).json({
      erro: erro.issues[0]?.message ?? 'Dados inválidos.',
      detalhes: erro.issues.map(({ path, message }) => ({ campo: path.join('.'), mensagem: message })),
    });
  }
  if (erro.code === 'P2002') {
    return res.status(409).json({ erro: 'Já existe uma busca com esses dados.' });
  }
  if (erro instanceof ErroHttp) {
    return res.status(erro.status).json({ erro: erro.message });
  }

  console.error('[buscas] ' + req.method + ' ' + req.path + ': falha interna');
  return res.status(500).json({ erro: 'Erro interno.' });
}
