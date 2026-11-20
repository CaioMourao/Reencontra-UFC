// Middleware Express para os serviços Publicações, Buscas e Avisos.
// Ele pega o JWT do cabeçalho Authorization e pergunta à Autenticação,
// por gRPC (ValidarToken), se o token é válido e de quem é.
//
// Dependências no serviço que usar: @grpc/grpc-js e @grpc/proto-loader
//
// Uso:
//   import { criarMiddlewareAuth } from './auth-grpc-middleware.js';
//   const exigirAutenticacao = criarMiddlewareAuth({
//     endereco: process.env.AUTH_GRPC_URL,   // ex.: "autenticacao:50051"
//     protoPath: '/app/proto/auth.proto',
//   });
//   app.post('/publicacoes', exigirAutenticacao, (req, res) => {
//     req.usuario.id // id de quem está logado
//   });
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

export function criarMiddlewareAuth({ endereco, protoPath, timeoutMs = 2000 }) {
  const definicao = protoLoader.loadSync(protoPath, { keepCase: true, defaults: true });
  const { Autenticacao } = grpc.loadPackageDefinition(definicao).reencontra.auth;
  const cliente = new Autenticacao(endereco, grpc.credentials.createInsecure());

  function validar(token) {
    return new Promise((resolve, reject) => {
      const prazo = new Date(Date.now() + timeoutMs);
      cliente.ValidarToken({ token }, { deadline: prazo }, (erro, resposta) =>
        erro ? reject(erro) : resolve(resposta),
      );
    });
  }

  return async function exigirAutenticacao(req, res, next) {
    const [esquema, token] = (req.get('authorization') ?? '').split(' ');
    if (esquema !== 'Bearer' || !token) {
      return res.status(401).json({ erro: 'Autenticação necessária.' });
    }
    try {
      const r = await validar(token);
      if (!r.valido) {
        return res
          .status(401)
          .json({ erro: r.motivo === 'expirado' ? 'Sessão expirada.' : 'Token inválido.' });
      }
      req.usuario = { id: r.usuario_id, email: r.email, nome: r.nome };
      next();
    } catch (erro) {
      // Se a Autenticação estiver fora do ar, negamos o acesso (falha segura)
      console.error('[auth] falha ao chamar ValidarToken:', erro.message);
      res.status(503).json({ erro: 'Serviço de autenticação indisponível.' });
    }
  };
}
