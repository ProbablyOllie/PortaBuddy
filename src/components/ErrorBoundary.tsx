import { Component, type ErrorInfo, type ReactNode } from 'react';
import { library } from '../lib/library';
import { emptyProject } from '../lib/project';

interface State {
  error: Error | null;
}

/**
 * If anything ever fails to render, show a way out instead of a blank page. Without this, a
 * project that can't be displayed would break the app on every visit, because the last open
 * project is reopened automatically.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('PortaBuddy crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const current = library.currentId();
    const others = library.list().filter((m) => m.id !== current);
    const open = (id: string) => {
      library.setCurrent(id);
      location.reload();
    };
    const download = () => {
      const raw = current ? library.raw(current) : null;
      if (!raw) return;
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'portabuddy-recovered.portabuddy.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    return (
      <div className="crash">
        <h1>Something went wrong showing this project</h1>
        <p>Your other projects are safe. You can download this one's data, open another project, or start a new one.</p>
        <div className="crash-actions">
          <button className="btn" onClick={download} disabled={!current}>
            Download this project's data
          </button>
          <button className="btn" onClick={() => open(library.create(emptyProject()))}>
            Start a new empty project
          </button>
          <button className="btn" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
        {others.length ? (
          <>
            <h2>Open another project</h2>
            <ul>
              {others.map((m) => (
                <li key={m.id}>
                  <button className="link" onClick={() => open(m.id)}>
                    {m.name || 'Untitled'}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="muted">Details: {String(this.state.error.message).slice(0, 200)}</p>
      </div>
    );
  }
}
