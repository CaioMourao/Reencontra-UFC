import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Toast } from 'primereact/toast';
import { api, obterAccessToken, renovarSessao } from '../api.js';

const AvisosContext = createContext(null);

export default function AvisosProvider() {
  const toastRef = useRef(null);
  const [naoLidos, setNaoLidos] = useState(0);
  const [naoLidasMensagens, setNaoLidasMensagens] = useState(0);
  const [revisao, setRevisao] = useState(0);
  const [revisaoMensagens, setRevisaoMensagens] = useState(0);

  const atualizarNaoLidos = useCallback(async () => {
    const resumo = await api('/api/avisos/resumo');
    setNaoLidos(resumo.naoLidos ?? 0);
    return resumo.naoLidos ?? 0;
  }, []);

  const atualizarNaoLidasMensagens = useCallback(async () => {
    const resumo = await api('/api/publicacoes/contatos');
    const total = resumo.naoLidas ?? (resumo.itens ?? []).reduce((soma, item) => soma + (item.naoLidas ?? 0), 0);
    setNaoLidasMensagens(total);
    return total;
  }, []);

  useEffect(() => {
    let ativo = true;
    let socket;
    let timerReconexao;
    let tentativas = 0;

    atualizarNaoLidos().catch(() => {});
    atualizarNaoLidasMensagens().catch(() => {});

    async function conectar(renovar = false) {
      if (!ativo) return;
      let token = renovar ? (await renovarSessao())?.accessToken : obterAccessToken();
      if (!token) token = (await renovarSessao())?.accessToken;
      if (!ativo) return;
      if (!token) {
        timerReconexao = setTimeout(() => conectar(true), 15000);
        return;
      }

      const protocolo = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(`${protocolo}//${window.location.host}/ws/avisos`);
      socket.addEventListener('open', () => {
        tentativas = 0;
        socket.send(JSON.stringify({ type: 'auth', token }));
      });
      socket.addEventListener('message', (evento) => {
        let mensagem;
        try { mensagem = JSON.parse(evento.data); } catch { return; }
        if (mensagem.type === 'mensagem') {
          setRevisaoMensagens((atual) => atual + 1);
          atualizarNaoLidasMensagens().catch(() => {});
          toastRef.current?.show({
            severity: 'info',
            summary: 'Nova mensagem',
            detail: `Conversa sobre o anúncio ${mensagem.mensagem?.referencia ?? ''}`.trim(),
            life: 2500,
          });
          return;
        }
        if (mensagem.type !== 'aviso') return;
        const aviso = mensagem.aviso;
        setNaoLidos((atual) => atual + 1);
        setRevisao((atual) => atual + 1);
        toastRef.current?.show({
          severity: 'info',
          summary: aviso.tipo === 'CONTATO_SOLICITADO'
            ? 'Nova solicitação de contato'
            : aviso.tipo === 'CONTATO_CODIGO_RENOVADO'
              ? 'Código de retirada renovado'
              : aviso.motivo === 'ANUNCIO_REABERTO' ? 'Anúncio reaberto' : 'Nova correspondência',
          detail: `${aviso.categoria ?? 'Objeto encontrado'} · ${aviso.referencia}`,
          life: 6000,
        });
        atualizarNaoLidos().catch(() => {});
      });
      socket.addEventListener('close', (evento) => {
        if (!ativo) return;
        const renovarAgora = evento.code === 4401;
        const espera = renovarAgora ? 0 : Math.min(30000, 1000 * 2 ** Math.min(tentativas, 5));
        tentativas += 1;
        timerReconexao = setTimeout(() => conectar(renovarAgora), espera);
      });
      socket.addEventListener('error', () => socket.close());
    }

    conectar();
    const intervaloResumo = setInterval(() => {
      atualizarNaoLidos().catch(() => {});
      atualizarNaoLidasMensagens().catch(() => {});
    }, 60000);
    return () => {
      ativo = false;
      clearTimeout(timerReconexao);
      clearInterval(intervaloResumo);
      socket?.close(1000, 'Navegação encerrada');
    };
  }, [atualizarNaoLidos, atualizarNaoLidasMensagens]);

  return (
      <AvisosContext.Provider value={{
        naoLidos,
        setNaoLidos,
        atualizarNaoLidos,
        naoLidasMensagens,
        setNaoLidasMensagens,
        atualizarNaoLidasMensagens,
        revisao,
        revisaoMensagens,
      }}>
      <Toast ref={toastRef} position="top-right" />
      <Outlet />
    </AvisosContext.Provider>
  );
}

export function useAvisos() {
  const contexto = useContext(AvisosContext);
  if (!contexto) throw new Error('useAvisos precisa estar dentro de <AvisosProvider>');
  return contexto;
}
