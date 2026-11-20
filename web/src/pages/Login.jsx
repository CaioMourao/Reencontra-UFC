import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import { Password } from 'primereact/password';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { entrar } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento) {
    evento.preventDefault();
    setErro('');
    if (!email.trim() || !senha) {
      setErro('Preencha e-mail e senha.');
      return;
    }
    setEnviando(true);
    try {
      await entrar(email.trim(), senha);
      navegar(local.state?.de ?? '/', { replace: true });
    } catch (e) {
      setErro(e.message);
      setSenha('');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="tela-login">
      <Card className="cartao-login">
        <div className="marca">
          <i className="pi pi-search" aria-hidden="true" />
          <h1>Reencontra</h1>
          <p>Achados e perdidos do campus</p>
        </div>

        <form onSubmit={enviar} noValidate className="formulario">
          <div className="campo">
            <label htmlFor="email">E-mail</label>
            <InputText
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              invalid={!!erro && !email}
              maxLength={254}
              placeholder="seu.email@alu.ufc.br"
              autoFocus
            />
          </div>

          <div className="campo">
            <label htmlFor="senha">Senha</label>
            <Password
              inputId="senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              feedback={false}
              toggleMask
              autoComplete="current-password"
              invalid={!!erro && !senha}
              maxLength={128}
            />
          </div>

          {erro && <Message severity="error" text={erro} role="alert" />}

          <Button type="submit" label="Entrar" icon="pi pi-sign-in" loading={enviando} />
        </form>
      </Card>
    </main>
  );
}
