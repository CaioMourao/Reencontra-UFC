import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ProgressSpinner } from 'primereact/progressspinner';
import { useAuth } from './AuthContext.jsx';

// Envolve as rotas que exigem login. Quem não está logado vai para /login
// e, depois de entrar, volta para a página que tentou abrir.
// Lembrete: isso só esconde telas. Quem protege os dados de verdade é o
// back-end, que valida o JWT em toda requisição.
export function RotaProtegida() {
  const { autenticado, carregando } = useAuth();
  const local = useLocation();

  if (carregando) {
    return (
      <div className="tela-centro">
        <ProgressSpinner style={{ width: 48, height: 48 }} strokeWidth="4" />
      </div>
    );
  }
  if (!autenticado) {
    return <Navigate to="/login" replace state={{ de: local.pathname }} />;
  }
  return <Outlet />;
}

// O contrário: quem já está logado não precisa ver a tela de login.
// Logo depois do login este componente re-renderiza antes da navegação do
// Login.jsx terminar; por isso ele também respeita "de", senão o usuário
// sempre caía em "/" em vez de voltar para a página que tentou abrir.
export function SomenteVisitante() {
  const { autenticado, carregando } = useAuth();
  const local = useLocation();
  if (carregando) return null;
  return autenticado ? <Navigate to={local.state?.de ?? '/'} replace /> : <Outlet />;
}
