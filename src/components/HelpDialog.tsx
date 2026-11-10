import { useEffect } from 'react';
import { useStore } from '../store';
import { CloseIcon } from './icons';

const SHORTCUTS: [keys: string[], action: string][] = [
  [['/'], 'Search (also Ctrl/⌘ + K)'],
  [['Ctrl', 'Z'], 'Undo'],
  [['Ctrl', 'Shift', 'Z'], 'Redo'],
  [['Delete'], 'Delete the selected cable, device or rack'],
  [['Esc'], 'Cancel a cable or a tap-then-tap action, or clear the selection'],
  [['['], 'Hide or show the device library'],
  [[']'], 'Hide or show properties'],
];

/** Everything that used to sit permanently in the properties panel: how-tos and shortcuts. */
export function HelpDialog() {
  const showHelp = useStore((s) => s.showHelp);
  const close = () => showHelp(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && showHelp(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showHelp]);

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal help-dialog" role="dialog" aria-label="Tips and shortcuts" onMouseDown={(e) => e.stopPropagation()}>
        <div className="projects-head">
          <h3>Tips and shortcuts</h3>
          <button className="icon-btn" aria-label="Close" onClick={close}>
            <CloseIcon />
          </button>
        </div>

        <h4>Racks and devices</h4>
        <ul className="help">
          <li>Drag devices from the library into a rack, or click one and then click a spot. Double-click drops it in the next free slot.</li>
          <li>Drag a device by its label to move it. Double-click the label to rename it.</li>
          <li>
            Switch between <b>Front</b>, <b>Rear</b> and <b>Both</b> with the Side buttons below the racks. Server NICs and power supplies are on the rear; use{' '}
            <b>Both</b> to run cables from front to rear.
          </li>
          <li>Click a cable, device or rack header to edit its details in the properties panel.</li>
        </ul>

        <h4>Cables</h4>
        <ul className="help">
          <li>Press on a port and drag to another port to run a cable — across racks too. Or click a free port, then the other port.</li>
          <li>Drag the end of an existing cable to a different port to re-patch it.</li>
          <li>
            Patching a whole panel? Select the device and use <b>Bulk patch</b> to connect a run of ports (e.g. 1–24 to Gi1–24) in one go.
          </li>
          <li>
            Busy rack? <b>Cables: Focus</b> (below the racks) shows only the cables of the device you select or point at. Auto switches to it once there are
            more than 30 cables.
          </li>
        </ul>

        <h4>Getting data in and out</h4>
        <ul className="help">
          <li>
            Already have a spreadsheet? <b>Projects → Import spreadsheet…</b> builds the racks, devices and cables from it.
          </li>
          <li>
            <b>Export</b> downloads an Excel workbook with the cable schedule, port map, device list and rack elevations, or prints to PDF.
          </li>
          <li>
            Your work is saved automatically in this browser, with earlier versions under <b>Projects</b>. Use <b>Save</b> to download a backup file you can
            share or re-open elsewhere — browser storage can be cleared.
          </li>
        </ul>

        <h4>Keyboard</h4>
        <table className="shortcuts">
          <tbody>
            {SHORTCUTS.map(([keys, action]) => (
              <tr key={action}>
                <td>
                  {keys.map((k, i) => (
                    <span key={k}>
                      {i ? ' + ' : ''}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </td>
                <td>{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
