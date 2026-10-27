import { useEffect } from 'react';
import { findPort } from '../lib/project';
import { allTemplates, useStore } from '../store';

/** Says what the next tap will do while something is picked (tap-then-tap), with a way out. */
export function ArmedBanner() {
  const armed = useStore((s) => s.armed);
  const project = useStore((s) => s.project);
  const arm = useStore((s) => s.arm);

  let text: string | null = null;
  if (armed?.kind === 'place') {
    const t = allTemplates(project).find((x) => x.id === armed.templateId);
    if (t) text = `Tap a free spot in a rack to place ${t.name}`;
  } else if (armed?.kind === 'move') {
    const d = project.devices.find((x) => x.id === armed.deviceId);
    if (d) text = `Tap where ${d.name} should go — in any rack, front or rear`;
  } else if (armed?.kind === 'patch') {
    const p = findPort(project, armed.from);
    if (p) text = `Tap another port to patch ${p.device.name} · ${p.port.name || p.group.label}`;
  } else if (armed?.kind === 'repatch') {
    const c = project.cables.find((x) => x.id === armed.cableId);
    const p = findPort(project, armed.from);
    if (c && p) text = `Tap the new port for the ${p.device.name} end of ${c.label}`;
  }

  // What was picked has gone (deleted, undone…): stop waiting for a tap.
  useEffect(() => {
    if (armed && !text) arm(null);
  }, [armed, text, arm]);

  if (!armed || !text) return null;
  return (
    <div className="armed-banner" role="status" onClick={(e) => e.stopPropagation()}>
      <span>{text}</span>
      <button className="btn" onClick={() => arm(null)}>
        Cancel
      </button>
    </div>
  );
}
