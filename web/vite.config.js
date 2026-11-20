import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento, /api/auth/* é repassado para o serviço de Autenticação.
// Assim o navegador fala com uma única origem e o cookie de refresh
// (SameSite=Strict) funciona sem precisar abrir CORS.
// Em produção, o Nginx faz o mesmo papel (veja nginx.conf).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/auth': {
        target: process.env.AUTH_URL ?? 'http://localhost:3001',
        rewrite: (caminho) => caminho.replace(/^\/api/, ''),
      },
    },
  },
});
