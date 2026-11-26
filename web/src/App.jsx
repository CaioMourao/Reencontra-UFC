import { Navigate, Route, Routes } from 'react-router-dom';
import { RotaProtegida, SomenteVisitante } from './auth/RotaProtegida.jsx';
import Login from './pages/Login.jsx';
import RedefinirSenha from './pages/RedefinirSenha.jsx';
import Inicio from './pages/Inicio.jsx';

export default function App() {
  return (
    <Routes>
      <Route element={<SomenteVisitante />}>
        <Route path="/login" element={<Login />} />
      </Route>
      <Route path="/redefinir-senha" element={<RedefinirSenha />} />

      {/* Tudo aqui dentro exige login */}
      <Route element={<RotaProtegida />}>
        <Route path="/" element={<Inicio />} />
        {/* próximas telas: /publicacoes, /buscas, /avisos */}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
