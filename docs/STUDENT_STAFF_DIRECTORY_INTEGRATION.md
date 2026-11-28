# Student and Staff Directory Integration

Status: v1.4 synthetic demo foundation. This document records the implemented demo behavior and the information required for a future protected SharePoint integration. It is not an authorization grant or a production deployment plan.

## Current release boundary

The Student Roster and Teachers & Staff views are available in demo mode only. They use synthetic records derived from the existing synthetic PACE dataset and persist changes in the existing browser-local `adminHubPaceDemoData` snapshot. No SharePoint directory list is read or written by this release. Production directory routes render a read-only “demo only” message, and the existing production administrative write gate remains unchanged.

The demo supports current directory profiles, add/edit actions, active/inactive lifecycle changes, duplicate warnings, browser-local history, and linked synthetic PACE activity. Directory roles are descriptive only; editing a role never grants Admin Hub access.

## Source systems and confirmed identifiers

The read-only implementation review of MAC-Walkthrough found these existing SharePoint sources on `IEP_Skook`:

| Source | List ID | Intended future use |
| --- | --- | --- |
| `IEP_Students_2026_27` | `d09f514e-94f0-4611-bff5-98c1fb69b457` | Student directory source |
| `IEP_Users2` | `5ff962d7-03b1-464b-84af-f8e332627779` | Staff/person source |
| `IEP_App_Users` | `43bac604-7880-4f0f-aed9-b7f2fea82133` | Explicit application authorization and entitlement source |

These identifiers are documentation from the existing read-only infrastructure review, not a live connection added to v1.4. MAC-Walkthrough was not modified.

## Implemented demo mapping

### Students

| Demo field | Synthetic source or behavior | Future source mapping confidence |
| --- | --- | --- |
| Stable ID | `demo-student-` plus normalized student name | Demo-only; future integration should use the SharePoint item ID |
| First/last name | Split from synthetic PACE `student` display name | Confirmed display fields exist in the existing roster adapter |
| Classroom | First matching synthetic PACE `teacherCameFrom` value | Confirmed as a current PACE relationship value; authoritative student-list column should be verified |
| Teacher relationship | Optional current directory value | Existing teacher relationship is a canonical display value; do not introduce a second identity format without schema approval |
| Active | Synthetic boolean | Existing student source exposes an `Active` field; exact live type/default must be verified |
| PACE enabled | Synthetic default `true` | Existing student source exposes a PACE flag; exact internal name/type must be verified |
| Daily Pulse enabled | Synthetic default `false` | Existing student source exposes a Pulse flag; exact internal name/type must be verified |
| History | Browser-local change events | Future audit/history must be server-side and protected |

The demo intentionally does not invent grade, enrollment-date, disability, or other sensitive directory attributes. The stable identifier shown in a profile is synthetic and must not be treated as an identity key for production historical joins.

### Teachers and staff

| Demo field | Synthetic source or behavior | Future source mapping confidence |
| --- | --- | --- |
| Stable ID | `demo-staff-` plus normalized email | Demo-only; future integration should use the SharePoint item ID |
| Display name | Synthetic staff seed | Existing `IEP_Users2` has a name field; internal name and canonical format require verification |
| Email | Synthetic `example.test` identity | Existing user source has an email field; value normalization and uniqueness require verification |
| Directory role | Teacher, Behavior Specialist, or Administrator | Existing role data is descriptive and distinct from application entitlement; do not assume role means access |
| Active | Synthetic boolean | Existing user source exposes an active/status field; exact live type/default requires verification |
| Classroom/program | Optional synthetic attributes | Must be mapped only after confirming live columns and ownership |
| History | Browser-local change events | Future audit/history must be server-side and protected |

`IEP_App_Users` remains the authoritative authorization mechanism. A directory role in `IEP_Users2` or in this demo must not be used as a substitute for explicit Admin Hub entitlement.

## Future protected integration

The safest next architecture is a protected server-side adapter that reads the authoritative directory sources and exposes only the fields required by Admin Hub. The browser should not receive broad directory permissions or write directly to SharePoint.

Before activation, technology staff must:

1. Confirm live list metadata, internal names, field types, required/default values, and item-ID behavior for both directory sources.
2. Confirm whether the directory sources are authoritative for all supported programs and whether access must be restricted by building or program.
3. Confirm canonical identity matching and active/inactive handling against `IEP_App_Users`.
4. Approve a server-side service identity with selected-resource permissions only. Do not use tenant-wide write permissions as a shortcut.
5. Keep directory reads separate from original PACE submission editing and from administrative review/audit storage.
6. Define no-delete enforcement at the service boundary. Deactivation or archival must not delete directory or PACE records.
7. Use ETags or an equivalent concurrency check for any approved future directory write and record the authenticated actor in a protected audit store.
8. Complete authenticated testing with representative administrators and Lead BIs without exposing student records in diagnostics.

The existing protected API configuration and SharePoint setup documents remain the source of truth for selected permissions, environment variables, deployment isolation, audit retention, and approval requirements. This document does not repeat secret names or secret values.

## Known limitations and risks

- Existing PACE records use display names in the current application data path; they do not yet carry a verified immutable student/staff directory ID. Renaming a directory record must not silently rewrite historical PACE attribution.
- Live directory field types, indexes, defaults, uniqueness, and permissions have not been changed or revalidated by v1.4.
- Browser-local history is suitable for synthetic review only and is not an audit control.
- A staff directory role is not an authorization decision. Authorization must continue to use authenticated identity plus explicit `IEP_App_Users` entitlement.
- Production directory mutations remain disabled until the protected service, selected permissions, audit protection, no-delete enforcement, and authenticated approval process are complete.

## Files implementing the demo

- `src/modules/directory/directory-model.js` — normalization, validation, stable demo IDs, duplicate checks, and sorting.
- `src/modules/directory/directory-data.js` — synthetic seeding, browser snapshot migration, history, and no-delete record lifecycle.
- `src/modules/directory/directory-views.js` — roster tables, profiles, task views, history, and production guard.
- `src/main.js` — demo-only state, existing snapshot persistence, delegated actions, draft preservation, and production gating.
- `src/app-shell.js`, `src/router.js`, and `styles.css` — navigation, routes, and responsive presentation.
