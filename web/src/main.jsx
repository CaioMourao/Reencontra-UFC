import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PrimeReactProvider, addLocale, locale } from 'primereact/api';

// Tema do PrimeReact. Para trocar, escolha outro em node_modules/primereact/resources/themes
import 'primereact/resources/themes/lara-light-teal/theme.css';
import 'primeicons/primeicons.css';
import './styles.css';

import { AuthProvider } from './auth/AuthContext.jsx';
import App from './App.jsx';

addLocale('pt-BR', {
  passwordPrompt: 'Digite a senha',
  weak: 'Fraca',
  medium: 'Média',
  strong: 'Forte',
});
locale('pt-BR');

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <PrimeReactProvider value={{ ripple: true }}>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </PrimeReactProvider>
  </StrictMode>,
);
