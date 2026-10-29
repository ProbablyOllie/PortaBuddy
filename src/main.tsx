import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './styles.css';

const root = createRoot(document.getElementById('root')!);

// GitHub Pages can't send headers that stop other sites framing the app, so refuse to run inside
// a frame from another site (clickjacking: tricking someone into clicking Delete through an overlay).
let framedElsewhere = false;
try {
  framedElsewhere = window.top !== window.self && window.top!.location.origin !== window.location.origin;
} catch {
  framedElsewhere = true; // reading a cross-origin parent's location throws
}

if (framedElsewhere) {
  root.render(
    <p style={{ font: '16px system-ui', padding: 24 }}>
      PortaBuddy can't run inside another website.{' '}
      <a href={window.location.href} target="_blank" rel="noopener noreferrer">
        Open it in its own tab
      </a>
      .
    </p>,
  );
} else {
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}
