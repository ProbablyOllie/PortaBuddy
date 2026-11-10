import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TemplateGlyph } from '../../components/TemplateGlyph';
import { BUILTIN_TEMPLATES } from '../templates';
import type { DeviceTemplate } from '../types';

const byId = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;
const ports = (html: string) => (html.match(/M[\d.]+ [\d.]+h/g) ?? []).length;

describe('TemplateGlyph', () => {
  it('draws one mark per front port', () => {
    // 48 RJ45 + 4 uplinks on the front; the two power inlets are on the back.
    expect(ports(renderToStaticMarkup(<TemplateGlyph template={byId('sw-48')} />))).toBe(52);
    expect(ports(renderToStaticMarkup(<TemplateGlyph template={byId('pp-24')} />))).toBe(24);
  });

  it('shows rear ports faintly when the front has none', () => {
    const html = renderToStaticMarkup(<TemplateGlyph template={byId('srv-1u')} />);
    expect(ports(html)).toBe(7);
    expect(html).toContain('opacity="0.4"');
  });

  it('draws a plain plate for devices without ports', () => {
    expect(renderToStaticMarkup(<TemplateGlyph template={byId('blank-1u')} />)).not.toContain('<path');
  });

  it('keeps every port inside the drawing, whatever the template says', () => {
    const odd: DeviceTemplate = {
      id: 'odd',
      name: 'Odd',
      category: 'other',
      heightU: 20,
      fullDepth: true,
      custom: true,
      portGroups: [
        { label: 'A', prefix: '', count: 1024, type: 'rj45', rows: 8, numbering: 'row' },
        { label: 'B', prefix: '', count: 3, type: 'sfp', rows: 0, numbering: 'row' },
      ],
    };
    const html = renderToStaticMarkup(<TemplateGlyph template={odd} />);
    const xs = [...html.matchAll(/M([\d.]+) ([\d.]+)h/g)].map((m) => [Number(m[1]), Number(m[2])]);
    expect(xs.length).toBe(1027);
    for (const [x, y] of xs) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(44);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(30);
    }
  });
});
