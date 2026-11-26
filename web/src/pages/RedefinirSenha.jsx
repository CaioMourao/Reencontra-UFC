import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Card } from 'primereact/card';
import { Password } from 'primereact/password';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { useAuth } from '../auth/AuthContext.jsx';

const regrasSenha = [
  { texto: 'Pelo menos 8 caracteres', valida: (s) => s.length >= 8 },
  { texto: 'Pelo menos uma letra', valida: (s) => /[A-Za-zÀ-ÿ]/.test(s) },
  { texto: 'Pelo menos um número', valida: (s) => /\d/.test(s) },
];

export default function RedefinirSenha() {
  const { redefinirSenha } = useAuth();
  const local = useLocation();
  const navegar = useNavigate();
  const [token] = useState(() => new URLSearchParams(local.hash.slice(1)).get('token') || '');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [concluida, setConcluida] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const forca = regrasSenha.filter((r) => r.valida(senha)).length;

  useEffect(() => {
    if (local.hash) navegar(local.pathname + local.search, { replace: true });
  }, [local.hash, local.pathname, local.search, navegar]);

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    if (!token) {
      setErro('Este link não é válido. Solicite uma nova recuperação.');
      return;
    }
    if (forca !== 3) {
      setErro('Use uma senha com pelo menos 8 caracteres, uma letra e um número.');
      return;
    }
    if (senha !== confirmacao) {
      setErro('As senhas não conferem.');
      return;
    }

    setEnviando(true);
    try {
      await redefinirSenha(token, senha);
      setConcluida(true);
      setSenha('');
      setConfirmacao('');
    } catch (e) {
      setErro(e.message);
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
          <p>Defina uma nova senha para sua conta</p>
        </div>

        {concluida ? (
          <div className="formulario">
            <Message severity="success" text="Senha atualizada. Entre com sua nova senha." role="status" />
            <Link className="p-button p-component botao-formulario" to="/login">
              <span className="p-button-icon p-c pi pi-sign-in" aria-hidden="true" />
              <span className="p-button-label p-c">Voltar para entrar</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={enviar} noValidate className="formulario">
            {erro && <Message severity="error" text={erro} role="alert" />}
            <div className="campo">
              <label htmlFor="nova-senha">Nova senha</label>
              <Password inputId="nova-senha" autoFocus value={senha} onChange={(e) => setSenha(e.target.value)}
                feedback={false} toggleMask autoComplete="new-password" maxLength={128}
                aria-describedby="requisitos-senha" />
              <div id="requisitos-senha" className="requisitos-senha" aria-live="polite">
                <div className="medidor-senha" role="progressbar" aria-valuemin={0} aria-valuemax={3}
                  aria-valuenow={forca} aria-label={'Força da senha: ' + forca + ' de 3 requisitos'}>
                  <span style={{ width: (forca / 3 * 100) + '%' }} />
                </div>
                <ul>{regrasSenha.map((regra) => <li key={regra.texto} className={regra.valida(senha) ? 'requisito-ok' : ''}>
                  <i className={'pi ' + (regra.valida(senha) ? 'pi-check-circle' : 'pi-circle')} aria-hidden="true" /> {regra.texto}
                </li>)}</ul>
              </div>
            </div>
            <div className="campo">
              <label htmlFor="confirmacao-senha">Confirmar nova senha</label>
              <Password inputId="confirmacao-senha" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)}
                feedback={false} toggleMask autoComplete="new-password" maxLength={128} />
            </div>
            <Button className="botao-formulario" type="submit" label="Salvar nova senha"
              icon="pi pi-check" loading={enviando} disabled={enviando || !token} />
            <p className="rodape-acesso"><Link to="/login">Voltar para entrar</Link></p>
          </form>
        )}
      </Card>
    </main>
  );
}
