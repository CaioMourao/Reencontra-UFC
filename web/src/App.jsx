import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ProgressSpinner } from 'primereact/progressspinner';
import { RotaProtegida, SomenteVisitante } from './auth/RotaProtegida.jsx';
import Login from './pages/Login.jsx';
import RedefinirSenha from './pages/RedefinirSenha.jsx';

const Publicacoes = lazy(() => import('./pages/Publicacoes.jsx'));
const Buscas = lazy(() => import('./pages/Buscas.jsx'));

export default function App() {
  return (
    <Suspense fallback={<div className="tela-centro"><ProgressSpinner style={{ width: 48, height: 48 }} strokeWidth="4" /></div>}>
      <Routes>
        <Route element={<SomenteVisitante />}>
          <Route path="/login" element={<Login />} />
        </Route>
        <Route path="/redefinir-senha" element={<RedefinirSenha />} />

        {/* Tudo aqui dentro exige login */}
        <Route element={<RotaProtegida />}>
          <Route path="/" element={<Navigate to="/publicacoes" replace />} />
          <Route path="/publicacoes" element={<Publicacoes />} />
          <Route path="/buscas" element={<Buscas />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
