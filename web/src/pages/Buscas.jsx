import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { ConfirmDialog } from 'primereact/confirmdialog';
import { confirmDialog } from 'primereact/confirmdialog';
import { Dialog } from 'primereact/dialog';
import { InputText } from 'primereact/inputtext';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { api } from '../api.js';
import MenuPrincipal from '../components/MenuPrincipal.jsx';

const POR_PAGINA = 12;

function dataHojeLocal() {
  const agora = new Date();
  agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
  return agora.toISOString().slice(0, 10);
}

function formularioVazio() {
  return { categoria: '', palavrasChave: '', localPerdido: '', dataInicio: '', dataFim: '' };
}

function formatarData(valor) {
  if (!valor) return '';
  const partes = valor.slice(0, 10).split('-').map(Number);
  return new Date(partes[0], partes[1] - 1, partes[2]).toLocaleDateString('pt-BR');
}

function formatarPeriodo(busca) {
  if (!busca.dataInicio || !busca.dataFim) return 'Qualquer período';
  return formatarData(busca.dataInicio) + ' a ' + formatarData(busca.dataFim);
}

function mensagemErro(erro) {
  if (erro?.status === 503) return 'Um serviço necessário está indisponível. Tente novamente em instantes.';
  return erro?.message ?? 'Não foi possível concluir a ação.';
}

function extrairPalavras(valor) {
  return [...new Set(valor.split(/[,\n;]/).map((palavra) => palavra.trim()).filter(Boolean))];
}

export default function Buscas() {
  const navegar = useNavigate();
  const toastRef = useRef(null);
  const [filtros, setFiltros] = useState({ q: '', categoria: '', status: 'TODAS' });
  const [filtrosAtivos, setFiltrosAtivos] = useState({ q: '', categoria: '', status: 'TODAS' });
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState({ itens: [], total: 0, temProxima: false });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');

  const [dialogVisivel, setDialogVisivel] = useState(false);
  const [idEditando, setIdEditando] = useState(null);
  const [formulario, setFormulario] = useState(formularioVazio);
  const [salvando, setSalvando] = useState(false);
  const [erroFormulario, setErroFormulario] = useState('');

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const parametros = new URLSearchParams({
        pagina: String(pagina),
        porPagina: String(POR_PAGINA),
      });
      for (const chave of ['q', 'categoria', 'status']) {
        if (filtrosAtivos[chave]) parametros.set(chave, filtrosAtivos[chave]);
      }
      const dados = await api('/api/buscas?' + parametros.toString());
      setResultado(dados);
    } catch (falha) {
      setErro(mensagemErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [filtrosAtivos, pagina]);

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
    setErroFormulario('');
    setDialogVisivel(true);
  }

  function abrirEdicao(busca) {
    setIdEditando(busca.id);
    setFormulario({
      categoria: busca.categoria,
      palavrasChave: busca.palavrasChave.join(', '),
      localPerdido: busca.localPerdido ?? '',
      dataInicio: busca.dataInicio ?? '',
      dataFim: busca.dataFim ?? '',
    });
    setErroFormulario('');
    setDialogVisivel(true);
  }

  function fecharFormulario() {
    if (salvando) return;
    setDialogVisivel(false);
    setIdEditando(null);
    setErroFormulario('');
  }

  async function salvarBusca(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErroFormulario('');
    try {
      const palavrasChave = extrairPalavras(formulario.palavrasChave);
      const corpo = {
        categoria: formulario.categoria,
        palavrasChave,
        localPerdido: formulario.localPerdido.trim() || null,
        dataInicio: formulario.dataInicio || null,
        dataFim: formulario.dataFim || null,
      };
      await api(idEditando ? '/api/buscas/' + idEditando : '/api/buscas', {
        metodo: idEditando ? 'PATCH' : 'POST',
        corpo,
      });
      const editava = !!idEditando;
      setDialogVisivel(false);
      setIdEditando(null);
      toastRef.current?.show({
        severity: 'success',
        summary: 'Sucesso',
        detail: editava ? 'Busca atualizada.' : 'Busca criada.',
        life: 3500,
      });
      await carregar();
    } catch (falha) {
      setErroFormulario(mensagemErro(falha));
    } finally {
      setSalvando(false);
    }
  }

  function arquivar(busca) {
    confirmDialog({
      header: 'Arquivar busca',
      message: 'A busca deixará de participar de novas correspondências. Você ainda poderá consultá-la nos filtros.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Arquivar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        try {
          await api('/api/buscas/' + busca.id + '/arquivar', { metodo: 'POST' });
          toastRef.current?.show({ severity: 'success', summary: 'Busca arquivada', detail: busca.categoria, life: 3500 });
          await carregar();
        } catch (falha) {
          setErro(mensagemErro(falha));
        }
      },
    });
  }

  function desarquivar(busca) {
    confirmDialog({
      header: 'Desarquivar busca',
      message: 'A busca voltará a ficar ativa e poderá participar de novas correspondências.',
      icon: 'pi pi-info-circle',
      acceptLabel: 'Desarquivar',
      rejectLabel: 'Cancelar',
      accept: async () => {
        try {
          await api('/api/buscas/' + busca.id + '/desarquivar', { metodo: 'POST' });
          toastRef.current?.show({ severity: 'success', summary: 'Busca desarquivada', detail: busca.categoria, life: 3500 });
          await carregar();
        } catch (falha) {
          setErro(mensagemErro(falha));
        }
      },
    });
  }

  const buscas = resultado.itens ?? [];

  return (
    <>
      <Toast ref={toastRef} position="top-right" />
      <ConfirmDialog />
      <MenuPrincipal
        secao="buscas"
        onObjetosEncontrados={() => navegar('/publicacoes')}
        onMinhasPublicacoes={() => navegar('/publicacoes?minhas=true')}
      />
      <main className="conteudo pagina-publicacoes pagina-buscas">
        <header className="cabecalho-pagina">
          <div>
            <p className="sobretitulo">ACHADOS E PERDIDOS DO CAMPUS</p>
            <h1>Minhas buscas</h1>
            <p className="texto-suave">Cadastre o que perdeu para comparar com novos objetos encontrados.</p>
          </div>
          <Button label="Criar busca" icon="pi pi-plus" onClick={abrirCriacao} />
        </header>

        {erro && <Message severity="error" text={erro} className="mensagem-pagina" />}

        <Card className="cartao-filtros">
          <form className="filtros-buscas" onSubmit={aplicarFiltros}>
            <div className="campo-filtro">
              <label htmlFor="buscas-q">Palavra-chave</label>
              <InputText id="buscas-q" value={filtros.q} maxLength={100} placeholder="Ex.: fone preto" onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} />
            </div>
            <div className="campo-filtro">
              <label htmlFor="buscas-categoria">Categoria</label>
              <InputText id="buscas-categoria" value={filtros.categoria} maxLength={60} placeholder="Ex.: eletrônicos" onChange={(e) => setFiltros({ ...filtros, categoria: e.target.value })} />
            </div>
            <div className="campo-filtro">
              <label htmlFor="buscas-status">Situação</label>
              <select id="buscas-status" className="p-inputtext p-component" value={filtros.status} onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}>
                <option value="ATIVA">Ativas</option>
                <option value="ARQUIVADA">Arquivadas</option>
                <option value="TODAS">Todas</option>
              </select>
            </div>
            <div className="acoes-filtro">
              <Button label="Filtrar" icon="pi pi-filter" type="submit" />
              <Button
                label="Limpar"
                icon="pi pi-times"
                severity="secondary"
                outlined
                type="button"
                onClick={() => {
                  const limpos = { q: '', categoria: '', status: 'TODAS' };
                  setFiltros(limpos);
                  setFiltrosAtivos(limpos);
                  setPagina(1);
                }}
              />
            </div>
          </form>
        </Card>

        <div className="resumo-publicacoes">
          <span>{resultado.total} {resultado.total === 1 ? 'busca' : 'buscas'}</span>
          <span>{filtrosAtivos.status === 'ATIVA' ? 'Somente ativas' : filtrosAtivos.status === 'ARQUIVADA' ? 'Somente arquivadas' : 'Todas as situações'}</span>
        </div>

        {carregando ? (
          <div className="carregando-publicacoes"><ProgressSpinner aria-label="Carregando buscas" /></div>
        ) : buscas.length === 0 ? (
          <Card className="estado-vazio">
            <i className="pi pi-search" aria-hidden="true" />
            <h2>{filtrosAtivos.q || filtrosAtivos.categoria ? 'Nenhuma busca encontrada' : 'Você ainda não cadastrou uma busca'}</h2>
            <p>{filtrosAtivos.q || filtrosAtivos.categoria ? 'Altere os filtros ou limpe a pesquisa.' : 'Crie uma busca para registrar o que perdeu e seus critérios.'}</p>
          </Card>
        ) : (
          <section className="grade-buscas" aria-label="Buscas cadastradas">
            {buscas.map((busca) => (
              <Card key={busca.id} className={`cartao-busca${busca.status === 'ARQUIVADA' ? ' cartao-busca-arquivada' : ''}`}>
                <div className="publicacao-cabecalho">
                  <div>
                    <span className="categoria-publicacao">{busca.categoria}</span>
                    <span className="referencia-publicacao">Criada em {formatarData(busca.criadoEm)}</span>
                  </div>
                  {busca.status !== 'ATIVA' && <Tag value="Arquivada" severity="secondary" />}
                </div>
                <p className="descricao-publicacao palavras-busca">{busca.palavrasChave.join(', ')}</p>
                <div className="detalhes-publicacao">
                  <span><i className="pi pi-map-marker" aria-hidden="true" /> {busca.localPerdido || 'Local não informado'}</span>
                  <span><i className="pi pi-calendar" aria-hidden="true" /> {formatarPeriodo(busca)}</span>
                </div>
                {busca.status === 'ATIVA' && (
                  <div className="acoes-publicacao">
                    <Button label="Editar" icon="pi pi-pencil" text onClick={() => abrirEdicao(busca)} />
                    <Button label="Arquivar" icon="pi pi-folder" severity="secondary" text onClick={() => arquivar(busca)} />
                  </div>
                )}
                {busca.status === 'ARQUIVADA' && (
                  <div className="acoes-publicacao">
                    <Button label="Desarquivar" icon="pi pi-folder-open" text onClick={() => desarquivar(busca)} />
                  </div>
                )}
              </Card>
            ))}
          </section>
        )}

        {!carregando && resultado.total > POR_PAGINA && (
          <nav className="paginacao-publicacoes" aria-label="Paginação de buscas">
            <Button label="Anterior" icon="pi pi-chevron-left" severity="secondary" outlined disabled={pagina <= 1} onClick={() => setPagina((atual) => atual - 1)} />
            <span>Página {pagina}</span>
            <Button label="Próxima" icon="pi pi-chevron-right" iconPos="right" severity="secondary" outlined disabled={!resultado.temProxima} onClick={() => setPagina((atual) => atual + 1)} />
          </nav>
        )}
      </main>

      <Dialog
        header={idEditando ? 'Editar busca' : 'Criar busca'}
        visible={dialogVisivel}
        onHide={fecharFormulario}
        className="dialog-busca"
        breakpoints={{ '640px': '96vw' }}
        style={{ width: 'min(94vw, 560px)' }}
        closable={!salvando}
        closeOnEscape={!salvando}
      >
        <form className="form-publicacao" onSubmit={salvarBusca}>
          <p className="texto-suave">Informe uma categoria e termos que ajudem a reconhecer o objeto.</p>
          {erroFormulario && <Message severity="error" text={erroFormulario} />}
          <div className="campo">
            <label htmlFor="busca-categoria">Categoria <span className="indicador-obrigatorio" aria-hidden="true">*</span></label>
            <InputText id="busca-categoria" value={formulario.categoria} minLength={2} maxLength={60} required disabled={salvando} onChange={(e) => setFormulario((atual) => ({ ...atual, categoria: e.target.value }))} />
          </div>
          <div className="campo">
            <label htmlFor="busca-palavras">Palavras-chave <span className="indicador-obrigatorio" aria-hidden="true">*</span></label>
            <InputTextarea id="busca-palavras" value={formulario.palavrasChave} minLength={2} maxLength={620} rows={3} autoResize required disabled={salvando} placeholder="Separe os termos por vírgula. Ex.: fone sem fio, preto, estojo" onChange={(e) => setFormulario((atual) => ({ ...atual, palavrasChave: e.target.value }))} />
            <small className="texto-suave">Até 12 termos; cada termo pode ter até 50 caracteres.</small>
          </div>
          <div className="campo">
            <label htmlFor="busca-local-perdido">Local perdido</label>
            <InputText id="busca-local-perdido" value={formulario.localPerdido} minLength={3} maxLength={120} disabled={salvando} placeholder="Ex.: bloco de salas, próximo à biblioteca" onChange={(e) => setFormulario((atual) => ({ ...atual, localPerdido: e.target.value }))} />
          </div>
          <fieldset className="periodo-formulario">
            <legend>Período aproximado em que perdeu o objeto</legend>
            <div className="periodo-campos">
              <div className="campo">
                <label htmlFor="busca-data-inicio">De</label>
                <InputText id="busca-data-inicio" type="date" max={dataHojeLocal()} value={formulario.dataInicio} required={!!formulario.dataFim} disabled={salvando} onChange={(e) => setFormulario((atual) => ({ ...atual, dataInicio: e.target.value }))} />
              </div>
              <div className="campo">
                <label htmlFor="busca-data-fim">Até</label>
                <InputText id="busca-data-fim" type="date" min={formulario.dataInicio || undefined} max={dataHojeLocal()} value={formulario.dataFim} required={!!formulario.dataInicio} disabled={salvando} onChange={(e) => setFormulario((atual) => ({ ...atual, dataFim: e.target.value }))} />
              </div>
            </div>
            <small className="texto-suave">Opcional. Deixe as duas datas vazias se não souber o período.</small>
          </fieldset>
          <div className="acoes-dialogo">
            <Button label="Cancelar" severity="secondary" outlined type="button" onClick={fecharFormulario} disabled={salvando} />
            <Button label={salvando ? 'Salvando…' : idEditando ? 'Salvar alterações' : 'Criar busca'} icon="pi pi-check" type="submit" loading={salvando} />
          </div>
        </form>
      </Dialog>
    </>
  );
}
