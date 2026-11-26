export function paraDataDia(valor) {
  return valor.toISOString().slice(0, 10);
}

export function publicarPublicacao(publicacao, usuarioId) {
  return {
    id: publicacao.id,
    referencia: publicacao.referencia,
    categoria: publicacao.categoria,
    descricao: publicacao.descricao,
    localAproximado: publicacao.localAproximado,
    dataEncontrado: paraDataDia(publicacao.dataEncontrado),
    temImagem: Boolean(publicacao.imagemArquivo),
    status: publicacao.status,
    criadoEm: publicacao.criadoEm,
    atualizadoEm: publicacao.atualizadoEm,
    arquivadaEm: publicacao.arquivadaEm,
    devolvidaEm: publicacao.devolvidaEm,
    souAutor: publicacao.usuarioId === usuarioId,
  };
}
