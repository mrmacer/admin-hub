# Admin Hub — PACE Follow-Up Experiment

Admin Hub is an administrator- and behavior-specialist-facing PACE dashboard.
The visible product is deliberately focused on the information gap around
PACE visits and administrative follow-up; it is not an SIS, discipline system,
IEP editor, or replacement for existing school systems.

## Architecture audit

Safely reused from PACE Room Tracker and MAC-Walkthrough:

- The existing Entra/MSAL app registration, tenant, and `window.location.origin`
  redirect pattern.
- The `IEP_Skook` SharePoint site resolution and delegated Microsoft Graph
  access pattern.
- Display-name-to-internal-name schema resolution for SharePoint columns.
- The live `IEP_Pace_Visits` field aliases and MAC's defensive normalization:
  local date-only filtering, duration fallback from Time In/Time Out, choice /
  Person value unwrapping, and null-safe SCM handling.
- Graph pagination with stable SharePoint item IDs.

Intentionally excluded: MAC intelligence, Daily Pulse, Living IEP logic,
Melissa-specific workflows, setup tools, reports, exports, and any PACE write,
edit, or delete operation.

## Authorization design

`IEP_App_Users` is the intended authorization source. V1 looks for these future
display columns in order:

- `Admin Hub`
- `PACE Dashboard`

Recommended future access columns to add manually, after review:

| Column | Type | Purpose |
| --- | --- | --- |
| `Admin Hub` | Yes/No | Access to the shared administrative shell |
| `PACE Dashboard` | Yes/No | Access to the PACE module |
The app does not create or modify SharePoint columns. Until an explicit Admin
Hub or PACE Dashboard column exists, a temporary migration fallback permits an
active `IEP_Users2` administrator. `Admin Panel` is never read as a grant and
is not a migration fallback. Set `CONFIG.authorization.enforceExplicitFlag`
to a stricter policy during the authorization cutover if desired.

For a future production follow-up workflow, consider a separate permission
such as `PACE Follow-Up` with Manage access. Do not modify `IEP_App_Users` as
part of the demo experiment.

## Application structure

```text
index.html / styles.css / server.js
src/
  config.js              Entra, SharePoint, module, and field configuration
  auth.js                Existing MSAL identity pattern
  graph.js               Read-only Graph client with paging and schema mapping
  authorization.js       IEP_App_Users decision policy
  date-utils.js          Local calendar and Graph boundary handling
  demo-data.js           Synthetic, non-identifying demo records
  router.js / app-shell.js / main.js
  components/            Escaping, cards, empty states, date-range control
  modules/pace/
    pace-data.js         Demo/Graph data adapter
    pace-analytics.js    Pure normalization and aggregation functions
    pace-follow-up.js    Separate synthetic review-state model
    pace-views.js        Overview, students, detail, and activity UI
test/                    Node built-in test suite
```

## Date handling

SharePoint Date values are normalized to a local calendar date before range
comparison. The Graph query uses a conservative local-midnight-to-next-day
UTC boundary and follows every `@odata.nextLink`; the UI then performs the
final date-only filter. Duration uses the live `Duration` number when present
and derives same-day minutes from Time In / Time Out when it is absent.

## Security notes

This remains a client-side delegated Graph architecture. UI authorization is
not row-level data security. The app does not broaden SharePoint access, does
not add secrets, and contains no browser-side application secret. Admin Hub is
read-only against `IEP_Pace_Visits`; the demo follow-up state is separate,
synthetic, in-memory browser state and resets on refresh.

## PACE follow-up experiment

The source PACE visit is historical and immutable in this dashboard. The demo
follow-up record is keyed by the PACE visit item ID and contains only:

- Status: `Needs Review`, `In Review`, or `Follow-Up Complete`
- Flagged By / Flagged At
- Reviewed By / Reviewed At
- Follow-Up Note
- Completed By / Completed At

The seeded demo has 6 Needs Review, 3 In Review, and 7 Follow-Up Complete
examples across 184 visits. The remaining 168 visits have no follow-up. Both
fictional administrators and behavior specialists can perform the demo actions
without a role matrix or real Microsoft identity.

## Proposed production follow-up data model

Do not create this list until the production workflow is approved. The
recommended separate SharePoint list is `IEP_Pace_Follow_Up`:

| Field | Type / guidance |
| --- | --- |
| `Title` | Single line; generated display label if needed |
| `PACE Visit Item ID` | Number or text canonical foreign-key relationship to `IEP_Pace_Visits` |
| `Status` | Choice: Needs Review, In Review, Follow-Up Complete |
| `Flagged By` / `Flagged At` | Person or text plus Date/Time |
| `Reviewed By` / `Reviewed At` | Person or text plus Date/Time |
| `Follow-Up Note` | Multiple lines of text |
| `Completed By` / `Completed At` | Person or text plus Date/Time |

Prefer not to duplicate `Student Identifier` unless a real query, security,
or reporting requirement proves it necessary. The PACE Visit Item ID should be
the canonical relationship. Index `PACE Visit Item ID`, `Status`, and the
date fields if production queue queries require them.

## Environments

Admin Hub has two explicit build environments. The environment is written to
`src/generated-environment.js` by `scripts/build-env.js`; it is never selected
from a URL query string or browser storage.

### DEMO

- Synthetic data only.
- No Microsoft authentication, Graph, SharePoint, or `IEP_App_Users` access.
- Intended for stakeholder review and safe experimentation.
- The Vercel demo project is hard-pinned to `npm run build:demo`.

### PRODUCTION

- Controlled Entra authentication.
- Explicit Admin Hub/module authorization.
- Real `IEP_Pace_Visits` SharePoint data.
- Not deployed by this project setup.

Changing or removing query parameters, editing localStorage/sessionStorage, or
forcing Graph failures cannot switch a demo build into production. Unknown
build environments fail closed.

## Local environments

```bash
# Safe synthetic demo build and local server
npm run build:demo
npm start

# Intentional production-capable build; do not share or deploy casually
npm run build:production
npm start
```

The checked-in generated environment is always safe demo mode. Run
`npm run build:demo` again before returning the working tree to demo status
after any local production build.

## Local run

```bash
cd "/Users/greg_macer/Projects/01-IU29/Admin Hub"
npm test
npm start
```

Open [http://localhost:4173/](http://localhost:4173/). If another local
service already owns port 4173, use `PORT=4174 npm start` and open
`http://localhost:4174/`.

## Review screenshots

- [Desktop demo review](review-desktop.png)
- [iPad portrait demo review](review-ipad.png)

## Recommended next step

Review the public synthetic demo with stakeholders before approving the four
`IEP_App_Users` authorization columns for a future production deployment.
