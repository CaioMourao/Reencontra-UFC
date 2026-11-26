import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tag } from 'primereact/tag';
import { Message } from 'primereact/message';
import { Toast } from 'primereact/toast';
import { ConfirmDialog } from 'primereact/confirmdialog';
import { confirmDialog } from 'primereact/confirmdialog';
import { api, apiBlob } from '../api.js';
import MenuPrincipal from '../components/MenuPrincipal.jsx';

const POR_PAGINA = 12;
const LIMITE_IMAGEM_BYTES = 5 * 1024 * 1024;
const TIPOS_IMAGEM = ['image/jpeg', 'image/png', 'image/webp'];

function dataHojeLocal() {
  const agora = new Date();
  agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
  return agora.toISOString().slice(0, 10);
}

function formularioVazio() {
  return {
    categoria: '',
    descricao: '',
    localAproximado: '',
    dataEncontrado: dataHojeLocal(),
  };
}

function ImagemRemota({ id, alt, className = 'imagem-publicacao' }) {
  const [url, setUrl] = useState('');
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let cancelada = false;
    let urlTemporaria = null;
    setUrl('');
    setFalhou(false);
    apiBlob(`/api/publicacoes/${id}/imagem`)
      .then((blob) => {
        const criada = URL.createObjectURL(blob);
        if (cancelada) URL.revokeObjectURL(criada);
        else {
          urlTemporaria = criada;
          setUrl(criada);
        }
      })
      .catch(() => { if (!cancelada) setFalhou(true); });
    return () => {
      cancelada = true;
      if (urlTemporaria) URL.revokeObjectURL(urlTemporaria);
    };
  }, [id]);

  if (falhou) return <div className={`${className}-placeholder`} role="img" aria-label={`${alt}: indisponível`}>Foto indisponível</div>;
  if (!url) return <div className={`${className}-placeholder`} aria-label="Carregando foto">Carregando foto…</div>;
  return <img className={className} src={url} alt={alt} />;
}

function PreviaImagemLocal({ arquivo }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const criada = URL.createObjectURL(arquivo);
    setUrl(criada);
    return () => URL.revokeObjectURL(criada);
  }, [arquivo]);
  return url ? <img className="imagem-publicacao miniatura-formulario" src={url} alt="Prévia da foto selecionada" /> : null;
}

function formatarData(valor) {
  if (!valor) return 'Data não informada';
  const [ano, mes, dia] = valor.slice(0, 10).split('-').map(Number);
  return new Date(ano, mes - 1, dia).toLocaleDateString('pt-BR');
}

function mensagemErro(erro) {
  if (erro?.status === 503) return 'Um serviço necessário está indisponível. Tente novamente em instantes.';
  return erro?.message ?? 'Não foi possível concluir a ação.';
}

export default function Publicacoes() {
  const location = useLocation();
  const [minhas, setMinhas] = useState(() => new URLSearchParams(location.search).get('minhas') === 'true');
  const [filtros, setFiltros] = useState({ q: '', categoria: '', de: '', ate: '', status: '' });
  const [filtrosAtivos, setFiltrosAtivos] = useState({ q: '', categoria: '', de: '', ate: '', status: '' });
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState({ itens: [], total: 0, temProxima: false });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const toastRef = useRef(null);

  const [dialogPublicacao, setDialogPublicacao] = useState(false);
  const [idEditando, setIdEditando] = useState(null);
  const [formulario, setFormulario] = useState(formularioVazio);
  const [imagemSelecionada, setImagemSelecionada] = useState(null);
  const [temImagemAtual, setTemImagemAtual] = useState(false);
  const imagemInputRef = useRef(null);
  const [salvando, setSalvando] = useState(false);
  const [erroFormulario, setErroFormulario] = useState('');

  const [respostaContato, setRespostaContato] = useState(null);
  const [publicacaoDevolucao, setPublicacaoDevolucao] = useState(null);
  const [codigoDevolucao, setCodigoDevolucao] = useState('');
  const [confirmandoDevolucao, setConfirmandoDevolucao] = useState(false);
  const [solicitacoes, setSolicitacoes] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const parametros = new URLSearchParams({
        pagina: String(pagina),
        porPagina: String(POR_PAGINA),
        minhas: String(minhas),
      });
      for (const chave of ['q', 'categoria', 'de', 'ate']) {
        if (filtrosAtivos[chave]) parametros.set(chave, filtrosAtivos[chave]);
      }
      if (minhas && filtrosAtivos.status) parametros.set('status', filtrosAtivos.status);
      const dados = await api(`/api/publicacoes?${parametros.toString()}`);
      setResultado(dados);
    } catch (falha) {
      setErro(mensagemErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [filtrosAtivos, minhas, pagina]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  function aplicarFiltros(evento) {
    evento.preventDefault();
    setPagina(1);
    setFiltrosAtivos(filtros);
  }

  function abrirCriacao() {
    setIdEditando(null);
    setFormulario(formularioVazio());
    limparImagemSelecionada();
    setTemImagemAtual(false);
    setErroFormulario('');
    setDialogPublicacao(true);
  }

  function abrirEdicao(publicacao) {
    setIdEditando(publicacao.id);
    setFormulario({
      categoria: publicacao.categoria,
      descricao: publicacao.descricao,
      localAproximado: publicacao.localAproximado,
      dataEncontrado: publicacao.dataEncontrado,
    });
    limparImagemSelecionada();
    setTemImagemAtual(publicacao.temImagem);
    setErroFormulario('');
    setDialogPublicacao(true);
  }

  function limparImagemSelecionada() {
    setImagemSelecionada(null);
    if (imagemInputRef.current) imagemInputRef.current.value = '';
  }

  function selecionarImagem(evento) {
    const arquivo = evento.target.files?.[0];
    if (!arquivo) return;
    if (!TIPOS_IMAGEM.includes(arquivo.type)) {
      setErroFormulario('A foto deve estar no formato JPG, PNG ou WebP.');
      setImagemSelecionada(null);
      evento.target.value = '';
      return;
    }
    if (arquivo.size > LIMITE_IMAGEM_BYTES) {
      setErroFormulario('A foto pode ter no máximo 5 MB.');
      setImagemSelecionada(null);
      evento.target.value = '';
      return;
    }
    setErroFormulario('');
    setImagemSelecionada(arquivo);
  }

  async function salvarPublicacao(evento) {
    evento.preventDefault();
    if (salvando) return;
    if (formulario.descricao.trim().length < 10) {
      setErroFormulario('A descrição precisa ter pelo menos 10 caracteres.');
      return;
    }
    if (!imagemSelecionada && !temImagemAtual) {
      setErroFormulario('Selecione uma foto do objeto para continuar.');
      return;
    }
    const corpo = new FormData();
    for (const [campo, valor] of Object.entries(formulario)) corpo.append(campo, valor);
    if (imagemSelecionada) corpo.append('imagem', imagemSelecionada);
    setSalvando(true);
    setErroFormulario('');
    try {
      if (idEditando) {
        await api(`/api/publicacoes/${idEditando}`, { metodo: 'PATCH', corpo });
        toastRef.current?.show({ severity: 'success', summary: 'Sucesso', detail: 'Publicação atualizada.', life: 3500 });
      } else {
        const dados = await api('/api/publicacoes', { metodo: 'POST', corpo });
        toastRef.current?.show({ severity: 'success', summary: 'Sucesso', detail: `Anúncio criado. Referência: ${dados.publicacao.referencia}.`, life: 3500 });
      }
      setImagemSelecionada(null);
      setTemImagemAtual(false);
      setDialogPublicacao(false);
      await carregar();
    } catch (falha) {
      setErroFormulario(mensagemErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  async function solicitarContato(publicacao) {
    setErro('');
    try {
      const dados = await api(`/api/publicacoes/${publicacao.id}/contatos`, {
        metodo: 'POST',
        corpo: {},
      });
      setRespostaContato({ ...dados, referencia: publicacao.referencia });
    } catch (falha) {
      setErro(mensagemErro(falha));
    }
  }

  function arquivar(publicacao) {
    confirmDialog({
      header: 'Arquivar anúncio',
      message: `O anúncio ${publicacao.referencia} deixará de aparecer nas buscas abertas.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Arquivar',
      rejectLabel: 'Cancelar',
      acceptClassName: 'p-button-danger',
      accept: async () => {
        setErro('');
        try {
          await api(`/api/publicacoes/${publicacao.id}/arquivar`, { metodo: 'POST', corpo: {} });
          toastRef.current?.show({ severity: 'success', summary: 'Sucesso', detail: `Anúncio ${publicacao.referencia} arquivado.`, life: 3500 });
          await carregar();
        } catch (falha) {
          setErro(mensagemErro(falha));
        }
      },
    });
  }

  function desarquivar(publicacao) {
    confirmDialog({
      header: 'Desarquivar anúncio',
      message: `O anúncio ${publicacao.referencia} voltará a aparecer nas buscas abertas.`,
      icon: 'pi pi-info-circle',
      acceptLabel: 'Desarquivar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        setErro('');
        try {
          await api(`/api/publicacoes/${publicacao.id}/desarquivar`, { metodo: 'POST', corpo: {} });
          toastRef.current?.show({ severity: 'success', summary: 'Sucesso', detail: `Anúncio ${publicacao.referencia} desarquivado.`, life: 3500 });
          await carregar();
        } catch (falha) {
          setErro(mensagemErro(falha));
        }
      },
    });
  }

  async function carregarSolicitacoes(publicacao) {
    setErro('');
    try {
      const dados = await api(`/api/publicacoes/${publicacao.id}/contatos`);
      setSolicitacoes({ referencia: publicacao.referencia, itens: dados.itens });
    } catch (falha) {
      setErro(mensagemErro(falha));
    }
  }

  async function confirmarDevolucao(evento) {
    evento.preventDefault();
    if (!publicacaoDevolucao) return;
    setConfirmandoDevolucao(true);
    setErroFormulario('');
    try {
      await api(`/api/publicacoes/${publicacaoDevolucao.id}/devolucao`, {
        metodo: 'POST',
        corpo: { codigoRetirada: codigoDevolucao },
      });
      setPublicacaoDevolucao(null);
      setCodigoDevolucao('');
      toastRef.current?.show({ severity: 'success', summary: 'Sucesso', detail: `Devolução de ${publicacaoDevolucao.referencia} confirmada.`, life: 3500 });
      await carregar();
    } catch (falha) {
      setErroFormulario(mensagemErro(falha));
    } finally {
      setConfirmandoDevolucao(false);
    }
  }

  return (
    <>
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />
      <MenuPrincipal
        secao="publicacoes"
        onObjetosEncontrados={() => { setMinhas(false); setPagina(1); }}
        onMinhasPublicacoes={() => { setMinhas(true); setPagina(1); }}
      />
      <main className="conteudo pagina-publicacoes">
        <header className="cabecalho-pagina">
          <div>
            <p className="sobretitulo">ACHADOS E PERDIDOS DO CAMPUS</p>
            <h1>{minhas ? 'Minhas publicações' : 'Objetos encontrados'}</h1>
            <p className="texto-suave">Encontre um item ou anuncie algo que você encontrou.</p>
          </div>
          <Button label="Publicar objeto" icon="pi pi-plus" onClick={abrirCriacao} />
        </header>

        {erro && <Message severity="error" text={erro} className="mensagem-pagina" />}

        <Card className="cartao-filtros">
          <form className="filtros-publicacoes" onSubmit={aplicarFiltros}>
            <div className="campo-filtro campo-busca">
              <label htmlFor="filtro-q">Palavra-chave</label>
              <InputText id="filtro-q" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} placeholder="Ex.: garrafa azul" maxLength={100} />
            </div>
            <div className="campo-filtro">
              <label htmlFor="filtro-categoria">Categoria</label>
              <InputText id="filtro-categoria" value={filtros.categoria} onChange={(e) => setFiltros({ ...filtros, categoria: e.target.value })} placeholder="Ex.: material escolar" maxLength={60} />
            </div>
            <div className="campo-filtro">
              <label htmlFor="filtro-de">Encontrado a partir de</label>
              <InputText id="filtro-de" type="date" value={filtros.de} onChange={(e) => setFiltros({ ...filtros, de: e.target.value })} />
            </div>
            <div className="campo-filtro">
              <label htmlFor="filtro-ate">Até</label>
              <InputText id="filtro-ate" type="date" value={filtros.ate} onChange={(e) => setFiltros({ ...filtros, ate: e.target.value })} />
            </div>
            {minhas && (
              <div className="campo-filtro">
                <label htmlFor="filtro-status">Situação</label>
                <select id="filtro-status" className="p-inputtext p-component" value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
                  <option value="">Todas</option>
                  <option value="ABERTA">Abertas</option>
                  <option value="ARQUIVADA">Arquivadas</option>
                  <option value="DEVOLVIDA">Devolvidas</option>
                </select>
              </div>
            )}
            <div className="acoes-filtro">
              <Button label="Buscar" icon="pi pi-search" type="submit" />
              <Button
                label="Limpar"
                severity="secondary"
                outlined
                type="button"
                onClick={() => {
                  const vazio = { q: '', categoria: '', de: '', ate: '', status: '' };
                  setFiltros(vazio);
                  setFiltrosAtivos(vazio);
                  setPagina(1);
                }}
              />
            </div>
          </form>
        </Card>

        <div className="resumo-publicacoes" aria-live="polite">
          <span>{resultado.total} {resultado.total === 1 ? 'anúncio' : 'anúncios'}</span>
          <Button icon="pi pi-refresh" text rounded aria-label="Atualizar lista" onClick={carregar} disabled={carregando} />
        </div>

        {carregando ? (
          <div className="carregando-publicacoes"><ProgressSpinner style={{ width: 42, height: 42 }} strokeWidth="4" /></div>
        ) : resultado.itens.length === 0 ? (
          <Card className="estado-vazio">
            <i className="pi pi-inbox" aria-hidden="true" />
            <h2>Nenhum anúncio por aqui</h2>
            <p>{minhas ? 'Suas publicações aparecerão nesta lista.' : 'Tente ajustar os filtros ou publique um objeto encontrado.'}</p>
          </Card>
        ) : (
          <section className="grade-publicacoes" aria-label="Lista de objetos encontrados">
            {resultado.itens.map((publicacao) => (
              <Card key={publicacao.id} className={`cartao-publicacao${publicacao.status === 'ARQUIVADA' ? ' cartao-publicacao-arquivada' : ''}`}>
                {publicacao.temImagem
                  ? <ImagemRemota id={publicacao.id} alt={`Foto do objeto: ${publicacao.descricao}`} className="imagem-publicacao imagem-publicacao-lista" />
                  : <div className="imagem-publicacao-placeholder imagem-publicacao-lista-placeholder" role="img" aria-label="Foto não cadastrada">Foto não cadastrada</div>}
                <div className="publicacao-cabecalho">
                  <div>
                    <span className="categoria-publicacao">{publicacao.categoria}</span>
                    <span className="referencia-publicacao">Ref. {publicacao.referencia}</span>
                  </div>
                  {publicacao.status !== 'ABERTA' && <Tag value={publicacao.status === 'DEVOLVIDA' ? 'Devolvido' : 'Arquivado'} severity="secondary" />}
                </div>
                <p className="descricao-publicacao">{publicacao.descricao}</p>
                <div className="detalhes-publicacao">
                  <span><i className="pi pi-map-marker" aria-hidden="true" /> {publicacao.localAproximado}</span>
                  <span><i className="pi pi-calendar" aria-hidden="true" /> Encontrado em {formatarData(publicacao.dataEncontrado)}</span>
                </div>
                <div className="acoes-publicacao">
                  {publicacao.souAutor ? (
                    publicacao.status === 'ABERTA' ? (
                      <>
                        <Button label="Editar" icon="pi pi-pencil" text onClick={() => abrirEdicao(publicacao)} />
                        <Button label="Solicitações" icon="pi pi-users" text onClick={() => carregarSolicitacoes(publicacao)} />
                        <Button label="Confirmar devolução" icon="pi pi-check-circle" outlined onClick={() => { setPublicacaoDevolucao(publicacao); setCodigoDevolucao(''); setErroFormulario(''); }} />
                        <Button label="Arquivar" icon="pi pi-folder" severity="secondary" text onClick={() => arquivar(publicacao)} />
                      </>
                    ) : publicacao.status === 'ARQUIVADA' ? (
                      <Button label="Desarquivar" icon="pi pi-folder-open" text onClick={() => desarquivar(publicacao)} />
                    ) : (
                      <span className="texto-suave">Este anúncio foi encerrado.</span>
                    )
                  ) : publicacao.status === 'ABERTA' ? (
                    <Button label="Tenho interesse" icon="pi pi-send" outlined onClick={() => solicitarContato(publicacao)} />
                  ) : null}
                </div>
              </Card>
            ))}
          </section>
        )}

        <nav className="paginacao-publicacoes" aria-label="Paginação">
          <Button label="Anterior" icon="pi pi-angle-left" text disabled={pagina <= 1 || carregando} onClick={() => setPagina((valor) => Math.max(1, valor - 1))} />
          <span>Página {pagina}</span>
          <Button label="Próxima" icon="pi pi-angle-right" iconPos="right" text disabled={!resultado.temProxima || carregando} onClick={() => setPagina((valor) => valor + 1)} />
        </nav>
      </main>

      <Dialog
        header={idEditando ? 'Editar publicação' : 'Publicar objeto encontrado'}
        visible={dialogPublicacao}
        onHide={() => setDialogPublicacao(false)}
        closable={!salvando}
        className="dialog-publicacao"
        breakpoints={{ '640px': '96vw' }}
        style={{ width: 'min(94vw, 560px)' }}
      >
        <form id="form-publicacao" className="form-publicacao" onSubmit={salvarPublicacao} aria-busy={salvando}>
          <p className="texto-suave">Descreva o objeto e informe apenas um local aproximado. Não inclua telefone nem e-mail.</p>
          {erroFormulario && <Message severity="error" text={erroFormulario} />}
          <div className="campo campo-imagem-publicacao">
            <label htmlFor="imagem-publicacao">Foto do objeto <span className="indicador-obrigatorio" aria-hidden="true">*</span></label>
            <input
              ref={imagemInputRef}
              id="imagem-publicacao"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={selecionarImagem}
              required={!temImagemAtual}
              disabled={salvando}
              aria-describedby="ajuda-imagem-publicacao"
            />
            <small id="ajuda-imagem-publicacao" className="texto-suave">Obrigatória · JPG, PNG ou WebP · até 5 MB · uma foto por anúncio.</small>
            {imagemSelecionada && (
              <div className="miniatura-imagem-selecionada">
                <PreviaImagemLocal arquivo={imagemSelecionada} />
                <span><strong>Prévia da foto</strong><small>{imagemSelecionada.name}</small></span>
                <Button icon="pi pi-times" severity="secondary" text rounded type="button" aria-label="Limpar foto selecionada" onClick={limparImagemSelecionada} disabled={salvando} />
              </div>
            )}
            {!imagemSelecionada && idEditando && temImagemAtual && (
              <div className="miniatura-imagem-selecionada">
                <ImagemRemota id={idEditando} alt="Foto atual do objeto" className="imagem-publicacao miniatura-formulario" />
                <span><strong>Foto atual</strong><small>Envie outra foto para substituí-la.</small></span>
              </div>
            )}
          </div>
          <div className="campo">
            <label htmlFor="categoria">Categoria <span className="indicador-obrigatorio" aria-hidden="true">*</span></label>
            <InputText id="categoria" value={formulario.categoria} onChange={(e) => setFormulario({ ...formulario, categoria: e.target.value })} required minLength={2} maxLength={60} disabled={salvando} />
          </div>
          <div className="campo">
            <label htmlFor="descricao">Descrição breve <span className="indicador-obrigatorio" aria-hidden="true">*</span></label>
            <InputTextarea id="descricao" value={formulario.descricao} onChange={(e) => setFormulario({ ...formulario, descricao: e.target.value })} required minLength={10} maxLength={500} rows={4} autoResize disabled={salvando} />
            <small className="texto-suave">Mínimo de 10 caracteres · {formulario.descricao.trim().length}/500</small>
          </div>
          <div className="campo">
            <label htmlFor="local-aproximado">Local aproximado <span className="indicador-obrigatorio" aria-hidden="true">*</span></label>
            <InputText id="local-aproximado" value={formulario.localAproximado} onChange={(e) => setFormulario({ ...formulario, localAproximado: e.target.value })} placeholder="Ex.: bloco de salas, próximo à biblioteca" required minLength={3} maxLength={120} disabled={salvando} />
          </div>
          <div className="campo">
            <label htmlFor="data-encontrado">Data em que encontrou <span className="indicador-obrigatorio" aria-hidden="true">*</span></label>
            <InputText id="data-encontrado" type="date" value={formulario.dataEncontrado} max={dataHojeLocal()} onChange={(e) => setFormulario({ ...formulario, dataEncontrado: e.target.value })} required disabled={salvando} />
          </div>
          <div className="acoes-dialogo">
            <Button label="Cancelar" severity="secondary" outlined type="button" onClick={() => setDialogPublicacao(false)} disabled={salvando} />
            <Button label={salvando ? 'Salvando…' : idEditando ? 'Salvar alterações' : 'Publicar'} icon="pi pi-check" type="submit" loading={salvando} />
          </div>
        </form>
      </Dialog>

      <Dialog
        header="Guarde seu código de retirada"
        visible={!!respostaContato}
        onHide={() => setRespostaContato(null)}
        className="dialog-codigo"
        breakpoints={{ '640px': '96vw' }}
        style={{ width: 'min(94vw, 440px)' }}
      >
        {respostaContato && (
          <div className="codigo-retirada-conteudo">
            <p>Solicitação registrada para o anúncio <strong>{respostaContato.referencia}</strong>. O aviso está sendo encaminhado ao sistema. Apresente este código ao autor na retirada do objeto.</p>
            <output className="codigo-retirada">{respostaContato.codigoRetirada}</output>
            <p className="texto-suave">O código expira em 24 horas e não será exibido novamente. Guarde-o em local seguro.</p>
            <Button label="Entendi" icon="pi pi-check" onClick={() => setRespostaContato(null)} />
          </div>
        )}
      </Dialog>

      <Dialog
        header={`Solicitações para ${solicitacoes?.referencia ?? ''}`}
        visible={!!solicitacoes}
        onHide={() => setSolicitacoes(null)}
        className="dialog-solicitacoes"
        breakpoints={{ '640px': '96vw' }}
        style={{ width: 'min(94vw, 480px)' }}
      >
        {solicitacoes && (solicitacoes.itens.length ? (
          <div className="lista-solicitacoes">
            <p>Há {solicitacoes.itens.length} {solicitacoes.itens.length === 1 ? 'solicitação ativa' : 'solicitações ativas'}. O código de retirada é apresentado pela pessoa no momento da entrega.</p>
            {solicitacoes.itens.map((item) => <p key={item.id} className="linha-solicitacao"><i className="pi pi-clock" /> Solicitação de {new Date(item.criadoEm).toLocaleString('pt-BR')} · expira em {new Date(item.codigoExpiraEm).toLocaleString('pt-BR')}</p>)}
          </div>
        ) : (
          <p className="texto-suave">Ainda não há solicitações ativas para este anúncio.</p>
        ))}
      </Dialog>

      <Dialog
        header="Confirmar devolução"
        visible={!!publicacaoDevolucao}
        onHide={() => { setPublicacaoDevolucao(null); setCodigoDevolucao(''); }}
        className="dialog-codigo"
        breakpoints={{ '640px': '96vw' }}
        style={{ width: 'min(94vw, 440px)' }}
      >
        {publicacaoDevolucao && (
          <form className="form-publicacao" onSubmit={confirmarDevolucao}>
            <p>Digite o código apresentado pela pessoa que retirou o objeto <strong>{publicacaoDevolucao.referencia}</strong>. Essa ação encerra o anúncio.</p>
            {erroFormulario && <Message severity="error" text={erroFormulario} />}
            <div className="campo">
              <label htmlFor="codigo-retirada">Código de retirada</label>
              <InputText id="codigo-retirada" inputMode="numeric" pattern="[0-9]{8}" maxLength={8} value={codigoDevolucao} onChange={(e) => setCodigoDevolucao(e.target.value.replace(/\D/g, '').slice(0, 8))} required autoFocus />
            </div>
            <div className="acoes-dialogo">
              <Button label="Cancelar" severity="secondary" outlined type="button" onClick={() => setPublicacaoDevolucao(null)} />
              <Button label="Confirmar" icon="pi pi-check" type="submit" loading={confirmandoDevolucao} disabled={codigoDevolucao.length !== 8} />
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
