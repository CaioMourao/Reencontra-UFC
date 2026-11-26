import { Menubar } from 'primereact/menubar';
import { Button } from 'primereact/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAvisos } from '../avisos/AvisosProvider.jsx';

export default function MenuPrincipal({ secao, onObjetosEncontrados, onMinhasPublicacoes }) {
  const navigate = useNavigate();
  const { usuario, sair } = useAuth();
  const { naoLidos } = useAvisos();

  const menu = [
    {
      label: 'Objetos encontrados',
      icon: 'pi pi-box',
      className: secao === 'publicacoes' ? 'menu-principal-ativo' : undefined,
      command: onObjetosEncontrados ?? (() => navigate('/publicacoes')),
    },
    {
      label: 'Minhas publicações',
      icon: 'pi pi-user',
      command: onMinhasPublicacoes ?? (() => navigate('/publicacoes?minhas=true')),
    },
    {
      label: 'Minhas buscas',
      icon: 'pi pi-search',
      className: secao === 'buscas' ? 'menu-principal-ativo' : undefined,
      command: () => navigate('/buscas'),
    },
    {
      label: 'Avisos',
      icon: 'pi pi-bell',
      className: secao === 'avisos' ? 'menu-principal-ativo' : undefined,
      badge: naoLidos > 0 ? String(naoLidos) : undefined,
      command: () => navigate('/avisos'),
    },
  ];

  const cabecalho = (
    <div className="topo-publicacoes">
      <strong className="logo-topo">Reencontra</strong>
    </div>
  );
  const rodape = (
    <div className="usuario-topo">
      <span>{usuario?.nome}</span>
      <Button label="Sair" icon="pi pi-sign-out" text onClick={sair} />
    </div>
  );

  return <Menubar model={menu} start={cabecalho} end={rodape} />;
}
