import { useMemo, useState } from 'react';
import { endDrag, startDrag } from '../lib/dnd';
import { firstFreePosition } from '../lib/project';
import { CATEGORY_LABELS } from '../lib/templates';
import type { DeviceCategory, DeviceTemplate } from '../lib/types';
import { allTemplates, useStore } from '../store';
import { TemplateEditor } from './TemplateEditor';

function portCount(t: DeviceTemplate) {
  return t.portGroups.reduce((n, g) => n + g.count, 0);
}

export function Library() {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const placeDevice = useStore((s) => s.placeDevice);
  const removeTemplate = useStore((s) => s.removeTemplate);
  const flash = useStore((s) => s.flash);
  const view = useStore((s) => s.view);
  const togglePanel = useStore((s) => s.togglePanel);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<DeviceTemplate | 'new' | null>(null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = allTemplates(project).filter((t) => !q || t.name.toLowerCase().includes(q) || t.category.includes(q));
    const byCat = new Map<string, DeviceTemplate[]>();
    for (const t of list) {
      const key = t.custom ? 'custom' : t.category;
      byCat.set(key, [...(byCat.get(key) ?? []), t]);
    }
    return [...byCat.entries()];
  }, [project, query]);

  /** Double-click / Enter fallback: put the device in the first free slot of the active rack. */
  const quickAdd = (t: DeviceTemplate) => {
    let rackId = project.racks[0]?.id;
    if (selection?.kind === 'rack') rackId = selection.id;
    if (selection?.kind === 'device') rackId = project.devices.find((d) => d.id === selection.id)?.rackId ?? rackId;
    if (!rackId) return flash('Add a rack first.');
    const facing = view === 'both' ? (t.defaultFacing ?? 'front') : view;
    const pos = firstFreePosition(project, rackId, { heightU: t.heightU, facing, fullDepth: t.fullDepth });
    if (pos === null) return flash('No free space in that rack.');
    placeDevice(t.id, rackId, pos, facing);
  };

  return (
    <aside className="library">
      <div className="panel-head">
        <div className="panel-title">Device library</div>
        <button className="collapse-btn" title="Hide panel ([)" onClick={() => togglePanel('library')}>
          «
        </button>
      </div>
      <input className="search" placeholder="Search devices…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <p className="hint">Drag a device into a rack. Double-click to drop it in the next free slot.</p>
      <div className="library-list">
        {groups.map(([cat, templates]) => (
          <section key={cat}>
            <h4>{cat === 'custom' ? 'My devices' : CATEGORY_LABELS[cat as DeviceCategory]}</h4>
            {templates.map((t) => (
              <div
                key={t.id}
                className={`template cat-${t.category}`}
                draggable
                tabIndex={0}
                onDragStart={(e) => startDrag(e, { kind: 'template', templateId: t.id, heightU: t.heightU, fullDepth: t.fullDepth })}
                onDragEnd={endDrag}
                onDoubleClick={() => quickAdd(t)}
                onKeyDown={(e) => e.key === 'Enter' && quickAdd(t)}
                title="Drag into a rack"
              >
                <div className="template-swatch" style={{ height: Math.min(4, t.heightU) * 7 }} />
                <div className="template-text">
                  <div className="template-name">{t.name}</div>
                  <div className="template-meta">
                    {t.heightU}U · {t.fullDepth ? 'full' : 'half'} depth · {portCount(t)} ports
                  </div>
                </div>
                {t.custom ? (
                  <div className="template-actions">
                    <button className="icon-btn" title="Edit" onClick={() => setEditing(t)}>
                      ✎
                    </button>
                    <button
                      className="icon-btn"
                      title="Delete"
                      onClick={() => {
                        if (confirm(`Delete device type "${t.name}"? Devices already placed are kept.`)) removeTemplate(t.id);
                      }}
                    >
                      ×
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </section>
        ))}
      </div>
      <button className="btn wide" onClick={() => setEditing('new')}>
        + Custom device type
      </button>
      {editing ? <TemplateEditor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </aside>
  );
}
