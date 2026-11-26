import { useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card } from 'primereact/card';
import { InputText } from 'primereact/inputtext';
import { Password } from 'primereact/password';
import { Button } from 'primereact/button';
import { Message } from 'primereact/message';
import { useAuth } from '../auth/AuthContext.jsx';

const regrasSenha = [
  { texto: 'Pelo menos 8 caracteres', valida: (s) => s.length >= 8 },
  { texto: 'Pelo menos uma letra', valida: (s) => /[A-Za-zÀ-ÿ]/.test(s) },
  { texto: 'Pelo menos um número', valida: (s) => /\d/.test(s) },
];

export default function Login() {
  const { entrar, cadastrar, solicitarRecuperacao } = useAuth();
  const navegar = useNavigate();
  const local = useLocation();
  const primeiroCampo = useRef(null);
  const [modo, setModo] = useState('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [erros, setErros] = useState({});
  const [tocados, setTocados] = useState({});
  const [enviando, setEnviando] = useState(false);

  function validar() {
    const novos = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) novos.email = 'Digite um e-mail válido.';
    if (modo === 'criar' && nome.trim().length < 2) novos.nome = 'Digite seu nome (pelo menos 2 caracteres).';
    if (modo === 'criar' && (senha.length < 8 || senha.length > 128 || !/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha))) {
      novos.senha = 'Use de 8 a 128 caracteres, com pelo menos uma letra e um número.';
    } else if (modo === 'entrar' && !senha) {
      novos.senha = 'Digite sua senha.';
    }
    if (modo === 'criar' && confirmacao !== senha) novos.confirmacao = 'As senhas não conferem.';
    setErros(novos);
    return novos;
  }

  function trocarModo(novo) {
    setModo(novo);
    setErro('');
    setSucesso('');
    setErros({});
    setTocados({});
    setSenha('');
    setConfirmacao('');
    requestAnimationFrame(() => primeiroCampo.current && primeiroCampo.current.focus());
  }

  async function enviar(e) {
    e.preventDefault();
    setErro('');
    setSucesso('');
    const falhas = validar();
    setTocados({ nome: true, email: true, senha: true, confirmacao: true });
    if (Object.keys(falhas).length) return;
    setEnviando(true);
    try {
      if (modo === 'recuperar') {
        const resposta = await solicitarRecuperacao(email.trim());
        setSucesso(resposta.mensagem);
      } else {
        if (modo === 'criar') await cadastrar(nome.trim(), email.trim(), senha);
        else await entrar(email.trim(), senha);
        navegar((local.state && local.state.de) || '/', { replace: true });
      }
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  }

  function erroVisivel(campo) {
    return tocados[campo] && erros[campo];
  }

  function validarAoSair() {
    requestAnimationFrame(() => validar());
  }

  const forca = regrasSenha.filter((r) => r.valida(senha)).length;

  return (
    <main className="tela-login">
      <Card className="cartao-login">
        <div className="marca">
          <i className="pi pi-search" aria-hidden="true" />
          <h1>Reencontra</h1>
          <p>Achados e perdidos do campus</p>
        </div>

        {modo !== 'recuperar' ? (
          <div className="abas-acesso" role="tablist" aria-label="Acesso à conta">
            <button type="button" role="tab" aria-selected={modo === 'entrar'} onClick={() => trocarModo('entrar')}>Entrar</button>
            <button type="button" role="tab" aria-selected={modo === 'criar'} onClick={() => trocarModo('criar')}>Criar conta</button>
          </div>
        ) : (
          <div className="titulo-recuperacao">
            <h2>Recuperar senha</h2>
            <p>Informe seu e-mail para receber um link de redefinição.</p>
          </div>
        )}

        <form onSubmit={enviar} noValidate className="formulario">
          {erro && <Message severity="error" text={erro} role="alert" />}
          {sucesso && <Message severity="success" text={sucesso} role="status" />}

          {modo === 'criar' && <div className="campo">
            <label htmlFor="nome">Nome</label>
            <InputText id="nome" ref={primeiroCampo} autoFocus autoComplete="name" value={nome}
              onChange={(e) => setNome(e.target.value)} onBlur={validarAoSair}
              invalid={!!erroVisivel('nome')} aria-describedby="erro-nome" maxLength={100} />
            {erroVisivel('nome') && <small id="erro-nome" className="erro-campo">{erros.nome}</small>}
          </div>}

          <div className="campo">
            <label htmlFor="email">E-mail</label>
            <InputText id="email" type="email" ref={modo !== 'criar' ? primeiroCampo : undefined}
              autoFocus={modo !== 'criar'} autoComplete={modo === 'entrar' ? 'username' : 'email'}
              value={email} onChange={(e) => setEmail(e.target.value)} onBlur={validarAoSair}
              invalid={!!erroVisivel('email')} aria-describedby="erro-email" maxLength={254}
              placeholder="seu.email@alu.ufc.br" />
            {erroVisivel('email') && <small id="erro-email" className="erro-campo">{erros.email}</small>}
          </div>

          {modo !== 'recuperar' && <div className="campo">
            <label htmlFor="senha">Senha</label>
            <Password inputId="senha" inputRef={modo === 'entrar' ? primeiroCampo : undefined}
              value={senha} onChange={(e) => setSenha(e.target.value)} onBlur={validarAoSair}
              feedback={false} toggleMask autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
              invalid={!!erroVisivel('senha')} aria-describedby="erro-senha requisitos-senha" maxLength={128} />
            {modo === 'criar' && <div id="requisitos-senha" className="requisitos-senha" aria-live="polite">
              <div className="medidor-senha" role="progressbar" aria-valuemin={0} aria-valuemax={3}
                aria-valuenow={forca} aria-label={'Força da senha: ' + forca + ' de 3 requisitos'}>
                <span style={{ width: (forca / 3 * 100) + '%' }} />
              </div>
              <ul>{regrasSenha.map((regra) => <li key={regra.texto} className={regra.valida(senha) ? 'requisito-ok' : ''}>
                <i className={'pi ' + (regra.valida(senha) ? 'pi-check-circle' : 'pi-circle')} aria-hidden="true" /> {regra.texto}
              </li>)}</ul>
            </div>}
            {erroVisivel('senha') && <small id="erro-senha" className="erro-campo">{erros.senha}</small>}
          </div>}

          {modo === 'criar' && <div className="campo">
            <label htmlFor="confirmacao">Confirmar senha</label>
            <Password inputId="confirmacao" value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)}
              onBlur={validarAoSair} feedback={false} toggleMask autoComplete="new-password"
              invalid={!!erroVisivel('confirmacao')} aria-describedby="erro-confirmacao" maxLength={128} />
            {erroVisivel('confirmacao') && <small id="erro-confirmacao" className="erro-campo">{erros.confirmacao}</small>}
          </div>}

          {modo === 'entrar' && <button className="esqueci-senha" type="button" onClick={() => trocarModo('recuperar')}>
            Esqueci minha senha
          </button>}

          <Button className="botao-formulario" type="submit"
            label={modo === 'criar' ? 'Criar conta' : modo === 'recuperar' ? 'Enviar link' : 'Entrar'}
            icon={modo === 'criar' ? 'pi pi-user-plus' : modo === 'recuperar' ? 'pi pi-envelope' : 'pi pi-sign-in'}
            loading={enviando} disabled={enviando} />
        </form>

        <p className="rodape-acesso">
          {modo === 'criar' ? 'Já tem conta? ' : modo === 'recuperar' ? 'Lembrou a senha? ' : 'Não tem conta? '}
          <button type="button" onClick={() => trocarModo(modo === 'criar' || modo === 'recuperar' ? 'entrar' : 'criar')}>
            {modo === 'criar' || modo === 'recuperar' ? 'Entrar' : 'Criar conta'}
          </button>
        </p>
      </Card>
    </main>
  );
}
