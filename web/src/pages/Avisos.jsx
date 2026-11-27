import { useCallback, useEffect, useState } from 'react';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tag } from 'primereact/tag';
import { Toast } from 'primereact/toast';
import { useRef } from 'react';
import { api } from '../api.js';
import { useAvisos } from '../avisos/AvisosProvider.jsx';
import MenuPrincipal from '../components/MenuPrincipal.jsx';
import { useNavigate } from 'react-router-dom';

const POR_PAGINA = 12;

function formatarData(valor) {
  if (!valor) return '';
  return new Date(valor).toLocaleString('pt-BR', { dateStyle: 'medium', timeStyle: 'short' });
}

function mensagemErro(erro) {
  if (erro?.status === 503) return 'Um serviço necessário está indisponível. Tente novamente em instantes.';
  return erro?.message ?? 'Não foi possível carregar os avisos.';
}

export default function Avisos() {
  const toastRef = useRef(null);
  const navigate = useNavigate();
  const { setNaoLidos, revisao } = useAvisos();
  const [filtro, setFiltro] = useState('TODOS');
  const [pagina, setPagina] = useState(1);
  const [resultado, setResultado] = useState({ itens: [], total: 0, naoLidos: 0, temProxima: false });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const parametros = new URLSearchParams({ pagina: String(pagina), porPagina: String(POR_PAGINA) });
      if (filtro === 'NAO_LIDOS') parametros.set('naoLidos', 'true');
      if (filtro === 'LIDOS') parametros.set('naoLidos', 'false');
      const dados = await api('/api/avisos?' + parametros.toString());
      setResultado(dados);
      setNaoLidos(dados.naoLidos ?? 0);
    } catch (falha) {
      setErro(mensagemErro(falha));
    } finally {
      setCarregando(false);
    }
  }, [filtro, pagina, setNaoLidos]);

  useEffect(() => { carregar(); }, [carregar, revisao]);

  async function marcarComoLido(aviso) {
    setAtualizando(true);
    try {
      await api(`/api/avisos/${aviso.id}/lida`, { metodo: 'PATCH' });
      toastRef.current?.show({ severity: 'success', summary: 'Aviso atualizado', detail: 'O aviso foi marcado como lido.', life: 3000 });
      await carregar();
    } catch (falha) {
      setErro(mensagemErro(falha));
    } finally {
      setAtualizando(false);
    }
  }

  async function marcarTodosComoLidos() {
    setAtualizando(true);
    try {
      await api('/api/avisos/lidas', { metodo: 'PATCH' });
      toastRef.current?.show({ severity: 'success', summary: 'Avisos atualizados', detail: 'Todos os avisos foram marcados como lidos.', life: 3000 });
      await carregar();
    } catch (falha) {
      setErro(mensagemErro(falha));
    } finally {
      setAtualizando(false);
    }
  }

  async function abrirConversa(aviso) {
    if (!aviso.lidoEm) {
      try {
        await api(`/api/avisos/${aviso.id}/lida`, { metodo: 'PATCH' });
        await carregar();
      } catch (falha) {
        setErro(mensagemErro(falha));
        return;
      }
    }
    navigate(`/mensagens?solicitacaoId=${aviso.solicitacaoContatoId}`);
  }

  return (
    <>
      <Toast ref={toastRef} position="top-right" />
      <MenuPrincipal secao="avisos" />
      <main className="conteudo pagina-publicacoes pagina-avisos">
        <header className="cabecalho-pagina">
          <div>
            <p className="sobretitulo">ACHADOS E PERDIDOS DO CAMPUS</p>
            <h1>Avisos</h1>
            <p className="texto-suave">Acompanhe correspondências, contatos e códigos de retirada renovados.</p>
          </div>
          <Button label="Marcar todos como lidos" icon="pi pi-check" severity="secondary" outlined disabled={!resultado.naoLidos || atualizando} onClick={marcarTodosComoLidos} />
        </header>

        {erro && <Message severity="error" text={erro} className="mensagem-pagina" />}

        <Card className="cartao-filtros">
          <div className="filtros-avisos" role="group" aria-label="Filtrar avisos">
            <Button label="Todos" text={filtro !== 'TODOS'} outlined={filtro !== 'TODOS'} onClick={() => { setFiltro('TODOS'); setPagina(1); }} />
            <Button label={`Não lidos${resultado.naoLidos ? ` (${resultado.naoLidos})` : ''}`} text={filtro !== 'NAO_LIDOS'} outlined={filtro !== 'NAO_LIDOS'} onClick={() => { setFiltro('NAO_LIDOS'); setPagina(1); }} />
            <Button label="Lidos" text={filtro !== 'LIDOS'} outlined={filtro !== 'LIDOS'} onClick={() => { setFiltro('LIDOS'); setPagina(1); }} />
          </div>
        </Card>

        <div className="resumo-publicacoes">
          <span>{resultado.total} {resultado.total === 1 ? 'aviso' : 'avisos'}</span>
          <span>{resultado.naoLidos} não {resultado.naoLidos === 1 ? 'lido' : 'lidos'}</span>
        </div>

        {carregando ? (
          <div className="carregando-publicacoes"><ProgressSpinner aria-label="Carregando avisos" /></div>
        ) : resultado.itens.length === 0 ? (
          <Card className="estado-vazio">
            <i className="pi pi-bell" aria-hidden="true" />
            <h2>{filtro === 'NAO_LIDOS' ? 'Você está em dia' : filtro === 'LIDOS' ? 'Nenhum aviso lido ainda' : 'Nenhum aviso por enquanto'}</h2>
            <p>{filtro === 'NAO_LIDOS' ? 'Não há avisos novos para conferir.' : 'Quando uma publicação combinar com sua busca, ela aparecerá aqui.'}</p>
          </Card>
        ) : (
          <section className="grade-avisos" aria-label="Lista de avisos">
            {resultado.itens.map((aviso) => (
              <Card key={aviso.id} className={`cartao-aviso${aviso.lidoEm ? ' cartao-aviso-lido' : ''}`}>
                <div className="publicacao-cabecalho">
                  <div>
                    <span className="categoria-publicacao">{aviso.categoria ?? 'Objeto encontrado'}</span>
                    <span className="referencia-publicacao">Ref. {aviso.referencia}</span>
                  </div>
                  <div className="tags-aviso">
                    {aviso.motivo === 'ANUNCIO_REABERTO' && <Tag value="Reaberto" severity="warning" />}
                    {!aviso.lidoEm && <Tag value="Novo" severity="info" />}
                  </div>
                </div>
                <p className="descricao-publicacao">
                  {aviso.tipo === 'CONTATO_CODIGO_RENOVADO'
                    ? 'A pessoa interessada gerou um novo código de retirada. O código anterior não é mais válido.'
                    : aviso.tipo === 'CONTATO_SOLICITADO'
                    ? 'Uma pessoa demonstrou interesse no seu anúncio. Abra a conversa para combinar a retirada.'
                    : aviso.motivo === 'ANUNCIO_REABERTO'
                      ? 'Este anúncio foi reaberto e voltou a combinar com sua busca.'
                      : 'Encontramos uma publicação compatível com sua busca.'}
                </p>
                <div className="detalhes-publicacao">
                  {!['CONTATO_SOLICITADO', 'CONTATO_CODIGO_RENOVADO'].includes(aviso.tipo) && <span><i className="pi pi-search" aria-hidden="true" /> Termos em comum: {aviso.palavrasEmComum.join(', ')}</span>}
                  {!['CONTATO_SOLICITADO', 'CONTATO_CODIGO_RENOVADO'].includes(aviso.tipo) && aviso.localPerdido && <span><i className="pi pi-map-marker" aria-hidden="true" /> Seu local perdido: {aviso.localPerdido}</span>}
                  <span><i className="pi pi-calendar" aria-hidden="true" /> {formatarData(aviso.ocorridoEm)}</span>
                </div>
                {['CONTATO_SOLICITADO', 'CONTATO_CODIGO_RENOVADO'].includes(aviso.tipo) ? (
                  <div className="acoes-publicacao">
                    <Button label="Abrir conversa" icon="pi pi-comments" onClick={() => abrirConversa(aviso)} />
                  </div>
                ) : !aviso.lidoEm && (
                  <div className="acoes-publicacao">
                    <Button label="Marcar como lido" icon="pi pi-check" text disabled={atualizando} onClick={() => marcarComoLido(aviso)} />
                  </div>
                )}
              </Card>
            ))}
          </section>
        )}

        {!carregando && resultado.total > POR_PAGINA && (
          <nav className="paginacao-publicacoes" aria-label="Paginação de avisos">
            <Button label="Anterior" icon="pi pi-chevron-left" severity="secondary" outlined disabled={pagina <= 1} onClick={() => setPagina((atual) => atual - 1)} />
            <span>Página {pagina}</span>
            <Button label="Próxima" icon="pi pi-chevron-right" iconPos="right" severity="secondary" outlined disabled={!resultado.temProxima} onClick={() => setPagina((atual) => atual + 1)} />
          </nav>
        )}
      </main>
    </>
  );
}
