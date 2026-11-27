import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { Dialog } from 'primereact/dialog';
import { InputTextarea } from 'primereact/inputtextarea';
import { Message } from 'primereact/message';
import { ProgressSpinner } from 'primereact/progressspinner';
import { Tag } from 'primereact/tag';
import { api } from '../api.js';
import { useAvisos } from '../avisos/AvisosProvider.jsx';
import MenuPrincipal from '../components/MenuPrincipal.jsx';

function dataHora(valor) {
  return new Date(valor).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function erroAmigavel(erro) {
  if (erro?.status === 503) return 'Um serviço necessário está indisponível. Tente novamente em instantes.';
  return erro?.message ?? 'Não foi possível carregar as conversas.';
}

export default function Mensagens() {
  const [parametros, setParametros] = useSearchParams();
  const solicitacaoSelecionada = parametros.get('solicitacaoId');
  const { revisaoMensagens, setNaoLidasMensagens } = useAvisos();
  const [conversas, setConversas] = useState([]);
  const [mensagens, setMensagens] = useState([]);
  const [texto, setTexto] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [carregandoMensagens, setCarregandoMensagens] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [erroEnvio, setErroEnvio] = useState('');
  const [erroCodigo, setErroCodigo] = useState('');
  const [codigoRenovado, setCodigoRenovado] = useState(null);
  const [gerandoCodigo, setGerandoCodigo] = useState(false);
  const fimMensagensRef = useRef(null);
  const solicitacaoRef = useRef(solicitacaoSelecionada);

  useEffect(() => { solicitacaoRef.current = solicitacaoSelecionada; }, [solicitacaoSelecionada]);

  const carregarConversas = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    try {
      const dados = await api('/api/publicacoes/contatos');
      const itens = dados.itens ?? [];
      setConversas(itens);
      setNaoLidasMensagens(dados.naoLidas ?? itens.reduce((total, item) => total + (item.naoLidas ?? 0), 0));
      setErro('');
    } catch (falha) {
      if (!silencioso) setErro(erroAmigavel(falha));
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, [setNaoLidasMensagens]);

  useEffect(() => { carregarConversas(); }, [carregarConversas]);

  useEffect(() => {
    setMensagens([]);
    setErroEnvio('');
  }, [solicitacaoSelecionada]);

  const carregarMensagens = useCallback(async (id, silencioso = false) => {
    if (!id) {
      setMensagens([]);
      return;
    }
    if (!silencioso) setCarregandoMensagens(true);
    try {
      const dados = await api(`/api/publicacoes/contatos/${id}/mensagens`);
      if (solicitacaoRef.current === id) setMensagens(dados.itens ?? []);
      await carregarConversas(true);
      setErroEnvio('');
    } catch (falha) {
      if (!silencioso && solicitacaoRef.current === id) setErroEnvio(erroAmigavel(falha));
    } finally {
      if (!silencioso) setCarregandoMensagens(false);
    }
  }, [carregarConversas]);

  useEffect(() => {
    carregarMensagens(solicitacaoSelecionada);
  }, [carregarMensagens, solicitacaoSelecionada, revisaoMensagens]);

  useEffect(() => {
    if (!solicitacaoSelecionada) return undefined;
    const intervalo = setInterval(() => carregarMensagens(solicitacaoSelecionada, true), 10000);
    return () => clearInterval(intervalo);
  }, [carregarMensagens, solicitacaoSelecionada]);

  useEffect(() => {
    fimMensagensRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensagens.length]);

  function abrirConversa(id) {
    setErroEnvio('');
    setTexto('');
    setParametros({ solicitacaoId: id });
  }

  async function enviarMensagem(evento) {
    evento.preventDefault();
    if (!solicitacaoSelecionada || !texto.trim() || enviando) return;
    setEnviando(true);
    setErroEnvio('');
    try {
      const dados = await api(`/api/publicacoes/contatos/${solicitacaoSelecionada}/mensagens`, {
        metodo: 'POST',
        corpo: { texto: texto.trim() },
      });
      setMensagens((atuais) => [...atuais, dados.mensagem]);
      setTexto('');
      await carregarConversas(true);
    } catch (falha) {
      setErroEnvio(erroAmigavel(falha));
    } finally {
      setEnviando(false);
    }
  }

  async function renovarCodigo() {
    if (!solicitacaoSelecionada || !conversa?.podeRenovarCodigo || gerandoCodigo) return;
    setGerandoCodigo(true);
    setErroCodigo('');
    try {
      const dados = await api(`/api/publicacoes/contatos/${solicitacaoSelecionada}/codigo-retirada`, {
        metodo: 'POST',
        corpo: {},
      });
      setCodigoRenovado(dados);
      await carregarConversas(true);
    } catch (falha) {
      setErroCodigo(erroAmigavel(falha));
    } finally {
      setGerandoCodigo(false);
    }
  }

  const conversa = conversas.find((item) => item.id === solicitacaoSelecionada);

  return (
    <>
      <MenuPrincipal secao="mensagens" />
      <main className="conteudo pagina-publicacoes pagina-mensagens">
        <header className="cabecalho-pagina">
          <div>
            <p className="sobretitulo">ACHADOS E PERDIDOS DO CAMPUS</p>
            <h1>Mensagens</h1>
            <p className="texto-suave">Converse sobre a retirada dos objetos com quem encontrou ou solicitou contato.</p>
          </div>
        </header>

        {erro && <Message severity="error" text={erro} className="mensagem-pagina" />}

        <section className="painel-mensagens" aria-label="Conversas de contato">
          <Card className="lista-conversas">
            <div className="lista-conversas-cabecalho">
              <h2>Conversas</h2>
              <span>{conversas.length}</span>
            </div>
            {carregando ? (
              <div className="carregando-publicacoes"><ProgressSpinner aria-label="Carregando conversas" /></div>
            ) : conversas.length === 0 ? (
              <div className="mensagens-vazio">
                <i className="pi pi-comments" aria-hidden="true" />
                <p>Suas conversas aparecerão aqui quando você demonstrar interesse em um anúncio ou receber uma solicitação.</p>
              </div>
            ) : (
              <div className="itens-conversas">
                {conversas.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    className={`item-conversa${item.id === solicitacaoSelecionada ? ' item-conversa-ativo' : ''}`}
                    onClick={() => abrirConversa(item.id)}
                    aria-current={item.id === solicitacaoSelecionada ? 'page' : undefined}
                  >
                    <span className="item-conversa-topo">
                      <strong>{item.categoria}</strong>
                      {item.naoLidas > 0
                        ? <Tag value={item.naoLidas} severity="info" />
                        : !item.podeEnviar && <Tag value="Encerrada" severity="secondary" />}
                    </span>
                    <span className="referencia-publicacao">Ref. {item.referencia} · {item.outraPessoa} · {dataHora(item.criadoEm)}</span>
                    <span className="item-conversa-preview">{item.ultimaMensagem?.texto ?? 'Inicie a conversa sobre este anúncio.'}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card className="painel-conversa">
            {!solicitacaoSelecionada ? (
              <div className="mensagens-vazio mensagens-vazio-painel">
                <i className="pi pi-comments" aria-hidden="true" />
                <h2>Escolha uma conversa</h2>
                <p>As mensagens sobre cada anúncio ficam organizadas em uma conversa privada entre as duas pessoas.</p>
              </div>
            ) : carregando && !conversa ? (
              <div className="carregando-publicacoes"><ProgressSpinner aria-label="Abrindo conversa" /></div>
            ) : !conversa ? (
              <div className="mensagens-vazio mensagens-vazio-painel">
                <i className="pi pi-lock" aria-hidden="true" />
                <h2>Conversa indisponível</h2>
                <p>Ela não existe ou sua conta não participa dela.</p>
                <Button label="Voltar às conversas" icon="pi pi-arrow-left" text onClick={() => setParametros({})} />
              </div>
            ) : (
              <>
                <header className="cabecalho-conversa">
                  <div>
                    <span className="categoria-publicacao">{conversa.categoria}</span>
                    <span className="referencia-publicacao">Ref. {conversa.referencia} · {conversa.outraPessoa}</span>
                  </div>
                  {!conversa.podeEnviar && <Tag value="Conversa encerrada" severity="secondary" />}
                </header>
                <div className="codigo-conversa">
                  <span>
                    <i className="pi pi-key" aria-hidden="true" />{' '}
                    {new Date(conversa.codigoExpiraEm).getTime() <= Date.now()
                      ? 'O código de retirada expirou.'
                      : `Código de retirada válido até ${dataHora(conversa.codigoExpiraEm)}.`}
                  </span>
                  {conversa.podeRenovarCodigo && (
                    <Button
                      label={gerandoCodigo ? 'Gerando…' : 'Gerar novo código'}
                      icon="pi pi-refresh"
                      text
                      loading={gerandoCodigo}
                      disabled={gerandoCodigo}
                      onClick={renovarCodigo}
                    />
                  )}
                </div>
                {erroCodigo && <Message severity="error" text={erroCodigo} className="mensagem-pagina" />}
                {erroEnvio && <Message severity="error" text={erroEnvio} className="mensagem-pagina" />}
                <div className="lista-mensagens" role="log" aria-label="Mensagens da conversa" aria-live="polite">
                  {carregandoMensagens && mensagens.length === 0 ? (
                    <div className="carregando-publicacoes"><ProgressSpinner aria-label="Carregando mensagens" /></div>
                  ) : mensagens.length === 0 ? (
                    <div className="mensagens-vazio">
                      <p>A conversa começou. Envie uma mensagem para combinar os próximos passos.</p>
                    </div>
                  ) : mensagens.map((mensagem) => (
                    <article key={mensagem.id} className={`mensagem-chat${mensagem.souRemetente ? ' mensagem-chat-minha' : ''}`}>
                      <p>{mensagem.texto}</p>
                      <time dateTime={mensagem.criadoEm}>{dataHora(mensagem.criadoEm)}</time>
                    </article>
                  ))}
                  <div ref={fimMensagensRef} />
                </div>
                {conversa.podeEnviar ? (
                  <form className="form-mensagem-chat" onSubmit={enviarMensagem}>
                    <InputTextarea
                      value={texto}
                      onChange={(evento) => setTexto(evento.target.value.slice(0, 2000))}
                      placeholder="Escreva sua mensagem…"
                      rows={2}
                      maxLength={2000}
                      autoResize
                      aria-label="Mensagem"
                      disabled={enviando}
                    />
                    <Button label={enviando ? 'Enviando…' : 'Enviar'} icon="pi pi-send" type="submit" loading={enviando} disabled={!texto.trim() || enviando} />
                  </form>
                ) : (
                  <p className="conversa-encerrada">Este anúncio foi encerrado. O histórico da conversa continua disponível para consulta.</p>
                )}
              </>
            )}
          </Card>
        </section>
      </main>

      <Dialog
        header="Novo código de retirada"
        visible={!!codigoRenovado}
        onHide={() => setCodigoRenovado(null)}
        className="dialog-codigo"
        breakpoints={{ '640px': '96vw' }}
        style={{ width: 'min(94vw, 440px)' }}
      >
        {codigoRenovado && (
          <div className="codigo-retirada-conteudo">
            <p>O código anterior foi invalidado. Apresente este novo código ao autor quando receber o objeto.</p>
            <output className="codigo-retirada">{codigoRenovado.codigoRetirada}</output>
            <p className="texto-suave">Válido até {dataHora(codigoRenovado.codigoExpiraEm)}. Ele só será exibido agora; se perdê-lo, gere outro pela conversa.</p>
            <div className="acoes-dialogo acoes-codigo-retirada">
              <Button label="Entendi" onClick={() => setCodigoRenovado(null)} />
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
