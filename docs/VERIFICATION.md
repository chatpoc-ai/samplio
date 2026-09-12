# Verification / 验收说明

## API integration checks

`npm test` initializes a temporary database and exercises:

1. Session login, invalid password rejection, allowed development origin and rejected foreign origin.
2. Private draft visibility, owner-only writes and administrator-only routes.
3. Image upload, persistent sample creation, generated unique code, access-controlled image delivery and actual similarity matching.
4. Updated sample revision and rejection of stale QR links; PNG QR download.
5. Publication, like/save toggles, comments, duplicate/spam rejection and weighted ranking.
6. Parsing a generated Excel workbook and verifying its selected-period score.
7. All-or-nothing bulk deletion, recycle-bin restore, business snapshot round trip and retained audit history.
8. Closed-review mutation rejection, parameter validation and session revocation.

These cover important state transitions and permission boundaries, rather than duplicating UI implementation details.

## Browser acceptance and screenshots

`npm run build` followed by `npm run test:browser` runs the production build with an isolated temporary server/database, then:

- Checks empty login fields and the absence of on-page demo account instructions.
- Signs in, creates a sample through file upload and the real form, publishes it, and submits interactions and a suggestion.
- Runs image search, visits rankings, and verifies an actual XLSX download.
- Visits administration and personal collections.
- Switches between English and Chinese, checks persistence after reload, and scans English screenshots for untranslated Chinese UI text (excluding the language toggle).
- Checks mobile overview and intake for document-level horizontal overflow.
- Signs in as an employee and confirms that administrator navigation is hidden.
- Fails on browser runtime errors and writes twelve real PNG screenshots.

The browser script does not touch the developer's running workspace. `PLAYWRIGHT_CHANNEL=chrome` selects an existing Chrome installation; otherwise install Chromium with `npx playwright install chromium`.

## Manual visual review

Desktop overview, intake, sample discussion, search, rankings and administration are reviewed from the generated screenshots. English copy spacing, form labels, blank credential fields, QR version copy and mobile cards are checked before publication.

## Not verified / 未验证

- Physical camera operation across real mobile devices. The UI uses `getUserMedia` with a capture-file fallback and an explicit error state; automation tests file uploads.
- Native WebMCP tool execution: the acceptance browser does not provide a supported `document.modelContext` implementation.
- Printer hardware, multi-host reverse proxies, encrypted disks, external AI services or high-concurrency production loads.
- A 1,000-user or low-latency service-level guarantee. This repository is a functional local POC.

## Reproducibility

Use the committed `package-lock.json` with `npm ci`. The tested dependency tree is checked with `npm audit`. Demo dates and screenshot timestamps are relative to the time the script runs, so regenerated screenshots are intentionally not pixel-identical over time.
