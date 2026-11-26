import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em desenvolvimento, as APIs compartilham a origem do Vite.
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
      '/api/publicacoes': {
        target: process.env.PUBLICACOES_URL ?? 'http://localhost:3002',
        rewrite: (caminho) => caminho.replace(/^\/api/, ''),
      },
      '/api/buscas': {
        target: process.env.BUSCAS_URL ?? 'http://localhost:3003',
        rewrite: (caminho) => caminho.replace(/^\/api/, ''),
      },
      '/api/avisos': {
        target: process.env.AVISOS_URL ?? 'http://localhost:3005',
        rewrite: (caminho) => caminho.replace(/^\/api/, ''),
      },
      '/ws/avisos': {
        target: process.env.AVISOS_URL ?? 'http://localhost:3005',
        ws: true,
        rewrite: () => '/ws',
      },
    },
  },
});
