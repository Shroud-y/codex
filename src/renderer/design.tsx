import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Harness from './design/Harness';
import './styles/global.css';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(
    <StrictMode>
      <Harness />
    </StrictMode>
  );
}
