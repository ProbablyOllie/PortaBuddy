# Security

PortaBuddy is a static, client-only web app. It has no server, accounts or network API: projects
are kept in the browser's local storage and only leave the device when you export or download a
file.

## Reporting a vulnerability

Please report security issues privately through GitHub's **Security → Report a vulnerability**
on this repository rather than opening a public issue.

## What is untrusted, and how it is handled

| Input / output | Risk | Protection |
| --- | --- | --- |
| Project files (`.portabuddy.json`) people send each other | CSS injection through a "colour" (e.g. `url(https://…)` beacons), crashes from wrong shapes, freezes from absurd sizes — all persistent, because the project is saved and reloaded every visit | Every project from a file **or** from storage goes through `sanitizeProject` (`src/lib/validate.ts`): types, enums and ranges are checked, colours must be `#rrggbb`, sizes and counts are capped, text is length-limited and stripped of control characters, references between racks/devices/ports/cables must be real. What can't be repaired is dropped and the user is told. |
| Spreadsheets imported (CSV / XLSX) | Memory exhaustion from huge files; same issues as project files once converted | File size (25 MB), row, column, cell-length and sheet-count caps; the converted project is sanitised before it is used. |
| Spreadsheets exported (CSV / XLSX) | Formula injection (`=HYPERLINK(…)`, `@SUM(…)cmd|…`) when the file is opened in Excel | CSV cells starting with `= + - @`, tab or CR are prefixed with `'`. XLSX cells are written as plain strings. |
| Port / device names | Regex backtracking (ReDoS) on long digit runs; selector injection | Linear scans instead of regexes; `CSS.escape` for selectors built from ids. |
| Rendering | Script injection | React escapes all text; there is no `dangerouslySetInnerHTML`, `eval` or HTML built from strings. The build ships a Content-Security-Policy (`script-src 'self'`, no inline script, `object-src 'none'`, `form-action 'none'`, `connect-src 'self'`) and `referrer: no-referrer`. |
| Framing | Clickjacking | The app refuses to run inside a page from another origin. |
| A bad project that still crashes the UI | Locked out of the app | An error screen lets you download the project's raw data, start a new project or open another one. |
| Build and deploy | Supply-chain compromise | GitHub Actions are pinned to commit SHAs, the workflow token is read-only except for the deploy job, credentials aren't persisted, `npm ci --ignore-scripts` skips install scripts, `npm audit` fails the build on high-severity advisories, and Dependabot proposes updates weekly. |

## Known limitations

- **Shared origin on GitHub Pages.** Every site under `probablyollie.github.io` shares one origin,
  so any of them could read or change PortaBuddy's local storage. Projects loaded from storage are
  still sanitised, so this can't be turned into script execution, but it could alter or read
  your data. Serving PortaBuddy from its own domain (a custom domain in **Settings → Pages**)
  removes this.
- **Headers can't be set on GitHub Pages.** The CSP is delivered as a `<meta>` tag, which can't
  express `frame-ancestors`; the in-app frame check covers that instead.
- **Compressed spreadsheets.** An `.xlsx` is a zip file, so one under the size cap can still expand
  to something very large and slow down or crash that browser tab. Nothing is saved in that case.
- **Local storage is not encrypted.** Anyone with access to the browser profile can read saved
  projects. Don't store secrets (passwords, keys) in device notes.
