# Admin Hub — PACE Follow-Up Experiment

Admin Hub is an administrator- and behavior-specialist-facing PACE dashboard.
The visible product is deliberately focused on the information gap around
PACE visits and administrative follow-up; it is not an SIS, discipline system,
IEP editor, or replacement for existing school systems. Its one write feature
is a Roster area where administrators add students and teachers to the IEP
Skook roster (see [Roster](#roster)).

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

- MAC's student-roster add path: the `IEP_Students_2026_27` column rules,
  canonical Teacher value, duplicate-name check, type-aware Yes/No values, and
  read-back verification by item id. Teachers are added the way MAC's Setup →
  Users does, fixed to Role = Teacher.

Intentionally excluded: MAC intelligence, Daily Pulse, Living IEP logic,
Melissa-specific workflows, the rest of MAC Setup (the full Users list,
Administrator accounts, editing or deactivating anyone, classrooms, data
tools), reports, exports, and any PACE write, edit, or delete operation.

## Authorization

Admin Hub uses the same access model as PACE, MAC-Walkthrough and Daily Pulse.
A user must first have an active row in `IEP_Users2`. Then:

- **Has an `IEP_App_Users` row (matched by Email):** the `Admin Panel` column
  decides. Yes allows access; No or blank denies it.
- **No `IEP_App_Users` row:** falls back to the legacy rule, so an active
  `IEP_Users2` user with Role = Administrator is allowed.
- **The lookup fails:** access is denied.

`Admin Panel` is shared with MAC-Walkthrough: Yes grants both the MAC admin
panel and Admin Hub. The column is set in
`CONFIG.authorization.permissionField`. Once every user has an `IEP_App_Users`
row, set `CONFIG.authorization.enforceAppUsers` to `true` so a missing row
means no access.

For a future production follow-up workflow, consider a separate permission
such as `PACE Follow-Up` with Manage access. Do not modify `IEP_App_Users` as
part of this project.

## Application structure

```text
index.html / styles.css / server.js
src/
  config.js              Entra, SharePoint, module, and field configuration
  auth.js                Existing MSAL identity pattern
  graph.js               Graph client: paging, schema mapping, roster-only creates
  authorization.js       IEP_App_Users decision policy
  date-utils.js          Local calendar and Graph boundary handling
  router.js / app-shell.js / main.js
  components/            Escaping, cards, empty states, date-range control
  modules/pace/
    pace-data.js         Graph data adapter for IEP_Pace_Visits
    pace-analytics.js    Pure normalization and aggregation functions
    pace-follow-up.js    Separate review-state model
    pace-views.js        Overview, students, detail, and activity UI
  modules/roster/
    roster-model.js      Pure student/teacher rules shared with MAC-Walkthrough
    roster-data.js       Roster load and the verified add path
    roster-views.js      Student Roster and Teachers pages
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
not row-level data security. The app does not add secrets and contains no
browser-side application secret. Admin Hub is read-only against
`IEP_Pace_Visits`. The follow-up workflow is switched off
(`CONFIG.followUp.enabled`) until it has a SharePoint list to save to.

To add to the roster, Admin Hub requests `Sites.ReadWrite.All`, the same scope
MAC-Walkthrough already uses on this shared app registration, so it gives
signed-in users no SharePoint access they did not already have through MAC.
Inside the app, `GRAPH.createListItem` refuses every list except
`CONFIG.writableLists` (`IEP_Users2`, `IEP_Students_2026_27`), and Admin Hub
has no update or delete operation at all.

## Roster

Two pages under **Roster** in the sidebar. Anyone allowed into Admin Hub can
use them; adds are refused unless the Admin Hub authorization decision allowed
the user.

- **Student Roster** adds a row to `IEP_Students_2026_27`, the list
  MAC-Walkthrough, PACE and Daily Pulse read. It collects first name, last
  name, teacher, an optional classroom, and Active / PACE Enabled / Daily
  Pulse Enabled (only Active starts on). The teacher dropdown lists active
  `IEP_Users2` teachers and saves the exact Teacher value existing students
  already use for that person (for example `Bossons, A`), or `Last, F` for a
  teacher with no students yet.
- **Teachers** adds a row to `IEP_Users2` with Role = Teacher and Active = Yes,
  plus a generated user id in Title. An email that already has a row is never
  added again. Adding a teacher does not grant Admin Hub access.

Each add follows MAC's rules. Nothing is sent until the whole roster has
loaded. A student whose name is already on the roster (inactive included)
needs a second confirmation. Every value is checked against the column's real
type, and a required column the form does not fill blocks the save. The new
row is then read back by its item id and compared field by field. If
SharePoint refuses, nothing was saved and trying again is safe. If the
connection drops mid-save, the result is reported as uncertain and is never
retried automatically.

Editing, deactivating, or reassigning existing students and users stays in
MAC-Walkthrough.

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
The Roster pages also read `IEP_Students_2026_27` and `IEP_Users2` when opened.

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
