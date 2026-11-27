import { Children, cloneElement, isValidElement } from 'react';
import { Menubar } from 'primereact/menubar';
import { Button } from 'primereact/button';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';
import { useAvisos } from '../avisos/AvisosProvider.jsx';

function itemComContador(item, opcoes) {
  if (!item.badge) return opcoes.element;

  const filhos = Children.toArray(opcoes.element.props.children);
  const indiceIcone = filhos.findIndex((filho) => (
    isValidElement(filho) && String(filho.props.className ?? '').includes('p-menuitem-icon')
  ));
  const indiceContador = indiceIcone >= 0 ? indiceIcone + 1 : filhos.length;
  filhos.splice(indiceContador, 0, (
    <span className="badge-menu-navegacao" aria-hidden="true" key="nao-lidos">
      {item.badge}
    </span>
  ));

  return cloneElement(opcoes.element, {
    className: `${opcoes.className} menu-item-com-badge`,
    'aria-label': `${item.label}, ${item.badge} itens não lidos`,
  }, filhos);
}

export default function MenuPrincipal({ secao, onObjetosEncontrados, onMinhasPublicacoes }) {
  const navigate = useNavigate();
  const { usuario, sair } = useAuth();
  const { naoLidos, naoLidasMensagens } = useAvisos();

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
      label: 'Mensagens',
      icon: 'pi pi-comments',
      className: secao === 'mensagens' ? 'menu-principal-ativo' : undefined,
      badge: naoLidasMensagens > 0 ? (naoLidasMensagens > 99 ? '99+' : String(naoLidasMensagens)) : undefined,
      template: itemComContador,
      command: () => navigate('/mensagens'),
    },
    {
      label: 'Avisos',
      icon: 'pi pi-bell',
      className: secao === 'avisos' ? 'menu-principal-ativo' : undefined,
      badge: naoLidos > 0 ? (naoLidos > 99 ? '99+' : String(naoLidos)) : undefined,
      template: itemComContador,
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
