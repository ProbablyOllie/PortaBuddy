import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { library } from '../library';
import { emptyProject } from '../project';

describe('crash recovery screen', () => {
  it('offers a way out instead of a blank page', () => {
    library.create({ ...emptyProject(), name: 'Other cabinet' });
    // The state React sets after a render error.
    class Crashed extends ErrorBoundary {
      state = { error: new Error('boom') };
    }
    const html = renderToStaticMarkup(
      <Crashed>
        <p>app</p>
      </Crashed>,
    );
    expect(html).toContain('Something went wrong showing this project');
    expect(html).toContain('Download this project');
    expect(html).toContain('Start a new empty project');
    expect(html).toContain('Other cabinet');
    expect(html).not.toContain('<p>app</p>');
    // Untouched when nothing went wrong.
    expect(renderToStaticMarkup(<ErrorBoundary><p>app</p></ErrorBoundary>)).toBe('<p>app</p>');
  });
});
