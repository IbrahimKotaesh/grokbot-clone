import { keepFresh } from './lib/fresh';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-500.css';
import '@fontsource/nunito/latin-600.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import '@fontsource/fraunces/latin-700.css';
import '@fontsource/fraunces/latin-900.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/shell.css';
import './styles/chat.css';
import './styles/cards.css';
import './styles/details.css';
import './styles/modals.css';
import './styles/viewer.css';
import './styles/voice.css';
import './styles/fino.css';
import './styles/phone-look.css';
import './styles/workspace.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

keepFresh();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
