# PortaBuddy

A platform to map out and document network and server cabinets.

PortaBuddy runs entirely in the browser: drag hardware into racks, patch cables port-to-port by
dragging between ports, and export the result as an Excel workbook for your documentation.

## Features

- **Racks** – any number of racks (1–60U), side by side, with names and locations.
- **Front and rear views** – switch between *Front*, *Rear* or *Both* sides of every rack. Ports
  live on the side they really are (server NICs and PSUs on the rear, switch ports on the front).
  Full-depth devices show on both sides; half-depth kit such as patch panels and PDUs only takes up
  the side it's mounted on, so two can share a U back to back. Devices can be turned round
  (mounted facing the rear), and cables run between the two sides in *Both* view — in a single-side
  view, a cable going round the back shows as a short stub.
- **Device library** – switches (8/16/24/48-port, PoE, SFP+ aggregation, QSFP spine), patch panels
  (12/24/48-port copper, LC/SC fibre), 1U/2U/4U servers, routers, firewalls, NAS/SAN, PDUs, UPS,
  cable managers and blanking panels.
- **Custom device types** – define your own hardware: height, depth, and any number of port groups
  (side, type, count, naming prefix, start number, rows, numbering order).
- **Drag & drop** – drag devices from the library into a rack slot (with a live fit/collision
  preview), and drag a device by its label to move it within or between racks.
- **Cabling** – press on a port and drag to any other port (including in another rack) to run a
  cable. Drag a cable end to a different port to re-patch it. Power outlets only patch to power
  inlets.
- **Bulk patch** – patch a run of ports in one go (e.g. panel ports 1–24 to switch Gi1–24) with a
  preview; ports already in use are skipped, and the whole run is a single undo step.
- **Search** – press `/` or Ctrl+K to find any rack, device, port or cable (e.g. `pp-a01 12`); the
  result is selected, scrolled into view and highlighted, switching to the right side of the rack.
- **Fits the screen** – the zoom fits the cabinet to the window until you zoom by hand (*Fit* turns
  it back on), and *Compact* draws empty rack units short so a full 42U cabinet stays readable.
- **Naming** – a newly dropped device asks for its name straight away; double-click a device label
  to rename it later.
- **Cable details** – ID/label (auto-numbered `C001`, `C002`, …), type (Cat5e–Cat8, OM3/OM4/OS2,
  DAC, AOC, power, console), colour, length and notes. Rename individual ports (e.g. `Gi1/0/1`).
- **Export**
  - **Excel (.xlsx)** with sheets: *Summary*, *Cable Schedule* (A/B ends with rack, U, device,
    port, side), *Port Map* (every port, free/connected, far end), *Devices* (incl. facing and
    depth), and *Rack Elevations* (front and rear of each rack).
  - **CSV** cable schedule or port map.
- **Save / Open** projects as `.portabuddy.json` files; work is also autosaved in the browser.
- Undo/redo, zoom, show/dim/hide cables for busy racks, and collapsible side panels for more
  room.

## Getting started

Requires Node.js 20.19+ (22 recommended).

```sh
npm install
npm run dev       # start the dev server at http://localhost:5173
npm test          # unit tests
npm run build     # production build in dist/
```

The build is a static site (relative paths), so `dist/` can be hosted anywhere.

### Hosting on GitHub Pages

`.github/workflows/deploy.yml` tests and builds every push and pull request, and deploys `main` to
GitHub Pages. To enable it, set **Settings → Pages → Build and deployment → Source** to
**GitHub Actions**.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Delete / Backspace | Delete the selected cable, device or rack |
| Ctrl/⌘ + Z | Undo |
| Ctrl/⌘ + Shift + Z, Ctrl + Y | Redo |
| Esc | Cancel a cable drag / clear selection |
| [ / ] | Hide or show the device library / properties panel |
| / or Ctrl/⌘ + K | Search |

## Project layout

```
src/
  lib/types.ts       data model (racks, devices, ports, cables)
  lib/templates.ts   built-in device library, cable types & colours
  lib/project.ts     placement rules and project helpers
  lib/export.ts      spreadsheet / CSV export
  store.ts           app state (zustand) with undo history and autosave
  components/        React UI: rack canvas, device library, inspector, toolbar
```
