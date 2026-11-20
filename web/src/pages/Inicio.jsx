import { useEffect, useState } from 'react';
import { Menubar } from 'primereact/menubar';
import { Button } from 'primereact/button';
import { Card } from 'primereact/card';
import { useAuth } from '../auth/AuthContext.jsx';
import { api } from '../api.js';

// Página inicial (protegida). Por enquanto só confirma a sessão chamando
// a rota protegida /auth/me; as telas de publicações, buscas e avisos
// entram aqui depois.
export default function Inicio() {
  const { usuario, sair } = useAuth();
  const [confirmado, setConfirmado] = useState(null);

  useEffect(() => {
    api('/api/auth/me')
      .then((d) => setConfirmado(d.usuario))
      .catch(() => setConfirmado(null));
  }, []);

  const fim = (
    <div className="usuario-topo">
      <span>{usuario?.nome}</span>
      <Button label="Sair" icon="pi pi-sign-out" text onClick={sair} />
    </div>
  );

  return (
    <>
      <Menubar
        start={<strong className="logo-topo">Reencontra</strong>}
        model={[
          { label: 'Início', icon: 'pi pi-home' },
          { label: 'Objetos encontrados', icon: 'pi pi-box', disabled: true },
          { label: 'Minhas buscas', icon: 'pi pi-search', disabled: true },
          { label: 'Avisos', icon: 'pi pi-bell', disabled: true },
        ]}
        end={fim}
      />
      <main className="conteudo">
        <Card title={`Olá, ${usuario?.nome?.split(' ')[0] ?? ''}!`}>
          <p>Você entrou no Reencontra.</p>
          {confirmado && (
            <p className="texto-suave">
              <i className="pi pi-shield" /> Sessão validada pelo servidor para {confirmado.email}.
            </p>
          )}
        </Card>
      </main>
    </>
  );
}
