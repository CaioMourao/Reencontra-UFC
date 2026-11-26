import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, aoExpirarSessao, definirToken, renovarSessao } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregando, setCarregando] = useState(true);

  // Ao abrir o app, tenta recuperar a sessão pelo cookie de refresh
  useEffect(() => {
    let ativo = true;
    renovarSessao().then((dados) => {
      if (!ativo) return;
      setUsuario(dados?.usuario ?? null);
      setCarregando(false);
    });
    aoExpirarSessao(() => setUsuario(null));
    return () => {
      ativo = false;
    };
  }, []);

  const entrar = useCallback(async (email, senha) => {
    const dados = await api('/api/auth/login', {
      metodo: 'POST',
      corpo: { email, senha },
      tentarRenovar: false,
    });
    definirToken(dados.accessToken);
    setUsuario(dados.usuario);
    return dados.usuario;
  }, []);

  const cadastrar = useCallback(async (nome, email, senha) => {
    const dados = await api('/api/auth/cadastro', { metodo: 'POST', corpo: { nome, email, senha }, tentarRenovar: false });
    definirToken(dados.accessToken);
    setUsuario(dados.usuario);
    return dados.usuario;
  }, []);

  const solicitarRecuperacao = useCallback(
    (email) => api('/api/auth/recuperar-senha', {
      metodo: 'POST',
      corpo: { email },
      tentarRenovar: false,
    }),
    [],
  );

  const redefinirSenha = useCallback(
    (token, senha) => api('/api/auth/redefinir-senha', {
      metodo: 'POST',
      corpo: { token, senha },
      tentarRenovar: false,
    }),
    [],
  );

  const sair = useCallback(async () => {
    try {
      await api('/api/auth/logout', { metodo: 'POST', tentarRenovar: false });
    } finally {
      definirToken(null);
      setUsuario(null);
    }
  }, []);

  const valor = useMemo(
    () => ({ usuario, carregando, autenticado: !!usuario, entrar, cadastrar, solicitarRecuperacao, redefinirSenha, sair }),
    [usuario, carregando, entrar, cadastrar, solicitarRecuperacao, redefinirSenha, sair],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
