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
part of this project.

## Application structure

```text
index.html / styles.css / server.js
src/
  config.js              Entra, SharePoint, module, and field configuration
  auth.js                Existing MSAL identity pattern
  graph.js               Read-only Graph client with paging and schema mapping
  authorization.js       IEP_App_Users decision policy
  date-utils.js          Local calendar and Graph boundary handling
  router.js / app-shell.js / main.js
  components/            Escaping, cards, empty states, date-range control
  modules/pace/
    pace-data.js         Graph data adapter for IEP_Pace_Visits
    pace-analytics.js    Pure normalization and aggregation functions
    pace-follow-up.js    Separate review-state model
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
read-only against `IEP_Pace_Visits`. The follow-up workflow is switched off
(`CONFIG.followUp.enabled`) until it has a SharePoint list to save to.

## PACE follow-up

The source PACE visit is historical and immutable in this dashboard. The
follow-up record is keyed by the PACE visit item ID and contains only:

- Status: `Needs Review`, `In Review`, or `Follow-Up Complete`
- Flagged By / Flagged At
- Reviewed By / Reviewed At
- Follow-Up Note
- Completed By / Completed At

Follow-up is disabled by `CONFIG.followUp.enabled = false` in `src/config.js`.
While it is off, the visit detail shows that follow-up is not yet connected and
the overview hides the follow-up queue and counts. Enable it only after
`IEP_Pace_Follow_Up` exists and the app can save to it; otherwise follow-up
state would live only in browser memory and be lost on refresh.

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

## Deployment

Admin Hub is a static site with no build step. Every load signs in through
Microsoft Entra, checks `IEP_Users2` and `IEP_App_Users`, and reads
`IEP_Pace_Visits` from the `IEP_Skook` SharePoint site through Microsoft Graph.

Sign-in redirects back to `window.location.origin`, so every address the app is
served from (the Vercel URL and `http://localhost:4173` for local work) must be
registered as a Single-page application redirect URI on the Entra app
registration in `CONFIG.auth.clientId`.

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

- [Desktop review](review-desktop.png)
- [iPad portrait review](review-ipad.png)

## Recommended next step

Approve the `IEP_App_Users` authorization columns, then create
`IEP_Pace_Follow_Up` and connect the follow-up workflow to it.
