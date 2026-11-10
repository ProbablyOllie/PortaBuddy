import { useMemo, useState } from 'react';
import { endDrag, startDrag } from '../lib/dnd';
import { firstFreePosition } from '../lib/project';
import { CATEGORY_LABELS } from '../lib/templates';
import type { DeviceCategory, DeviceTemplate } from '../lib/types';
import { allTemplates, useStore } from '../store';
import { ChevronRightIcon, CloseIcon, CollapseLeftIcon, EditIcon, PlusIcon } from './icons';
import { TemplateEditor } from './TemplateEditor';
import { TemplateGlyph } from './TemplateGlyph';

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
  const armedTemplate = useStore((s) => (s.armed?.kind === 'place' ? s.armed.templateId : null));
  const arm = useStore((s) => s.arm);
  const collapsedCats = useStore((s) => s.collapsedCats);
  const toggleCat = useStore((s) => s.toggleCat);
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
          <CollapseLeftIcon />
        </button>
      </div>
      <input className="search" placeholder="Search devices…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <p className="hint">Drag a device into a rack, or tap it and then tap a spot in a rack. Double-click drops it in the next free slot.</p>
      <div className="library-list">
        {groups.map(([cat, templates]) => {
          // Searching shows every match, folded or not.
          const open = !!query.trim() || !(Array.isArray(collapsedCats) && collapsedCats.includes(cat));
          return (
          <section key={cat}>
            <h4>
              <button className="lib-cat" aria-expanded={open} onClick={() => toggleCat(cat)}>
                <ChevronRightIcon size={12} />
                {cat === 'custom' ? 'My devices' : CATEGORY_LABELS[cat as DeviceCategory]}
                <span className="lib-count">{templates.length}</span>
              </button>
            </h4>
            {(open ? templates : []).map((t) => (
              <div
                key={t.id}
                className={`template cat-${t.category}${armedTemplate === t.id ? ' armed' : ''}`}
                aria-pressed={armedTemplate === t.id}
                draggable
                tabIndex={0}
                onDragStart={(e) => startDrag(e, { kind: 'template', templateId: t.id, heightU: t.heightU, fullDepth: t.fullDepth })}
                onDragEnd={endDrag}
                onClick={() => arm(armedTemplate === t.id ? null : { kind: 'place', templateId: t.id })}
                onDoubleClick={() => {
                  arm(null);
                  quickAdd(t);
                }}
                onKeyDown={(e) => e.key === 'Enter' && quickAdd(t)}
                title="Drag into a rack"
              >
                <TemplateGlyph template={t} />
                <div className="template-text">
                  <div className="template-name">{t.name}</div>
                  <div className="template-meta">
                    {t.heightU}U · {t.fullDepth ? 'full' : 'half'} depth · {portCount(t)} ports
                  </div>
                </div>
                {t.custom ? (
                  <div className="template-actions">
                    <button
                      className="icon-btn"
                      title="Edit"
                      aria-label={`Edit ${t.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(t);
                      }}
                    >
                      <EditIcon size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      title="Delete"
                      aria-label={`Delete ${t.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete device type "${t.name}"? Devices already placed are kept.`)) removeTemplate(t.id);
                      }}
                    >
                      <CloseIcon size={14} />
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </section>
          );
        })}
      </div>
      <button className="btn wide" onClick={() => setEditing('new')}>
        <PlusIcon size={14} />
        Custom device type
      </button>
      {editing ? <TemplateEditor initial={editing === 'new' ? null : editing} onClose={() => setEditing(null)} /> : null}
    </aside>
  );
}
