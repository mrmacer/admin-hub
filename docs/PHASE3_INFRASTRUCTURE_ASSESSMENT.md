# Admin Hub v1.1 — Phase 3 Infrastructure Assessment

Status: investigation and documentation only. No SharePoint lists, permissions,
Entra settings, production records, source code behavior, or deployments were
changed by this assessment.

Assessment date: 2026-11-25
Admin Hub: `/Users/greg_macer/Projects/01-IU29/Admin Hub`
Reference application: `/Users/greg_macer/Projects/01-IU29/MAC-Walkthrough`

## Executive finding

Admin Hub and MAC-Walkthrough use the same Entra tenant and the same client ID
in their local MSAL configuration:

- Client ID: `145a3fc7-5cff-4d03-96c7-577e17980110`
- Tenant authority: `https://login.microsoftonline.com/3276761c-22db-462b-a930-172d155bd795`

That establishes shared application-registration configuration in the code,
not approval for a new production workflow. Redirect URIs, consent state,
resource assignments, and tenant policy still require verification by the
Entra administrator.

The applications currently differ materially:

| Area | Admin Hub | MAC-Walkthrough |
| --- | --- | --- |
| Graph scope requested | `User.Read`, `Sites.Read.All` | `User.Read`, `Sites.ReadWrite.All` |
| PACE source | `IEP_Pace_Visits` | `IEP_Pace_Visits` |
| Identity source | `IEP_Users2` | `IEP_Users2` |
| App authorization | `IEP_App_Users` Admin Hub/PACE fields, with temporary active-Administrator fallback | `IEP_App_Users` Admin Panel flag, with temporary active-Administrator fallback |
| PACE source writes | Disabled; the production gate is `false` | Existing browser PATCH path is present |
| PACE deletion | No production delete operation | Direct Graph `DELETE` path exists |
| Independent review/audit lists | Not present in SharePoint; Phase 2 adapter is prepared but gated | No equivalent PACE review/audit store identified |

The recommended production direction is a protected server-side service with
narrow SharePoint resource permissions. The administrative review workflow can
be enabled independently of source-record editing, using only the two separate
administrative lists and a closed source-edit gate.

## 1. Existing authentication and authorization

### Admin Hub

Admin Hub creates a browser MSAL public client in production. It acquires a
delegated token silently for the signed-in account, reads `IEP_Users2`, and
requires an active account. `IEP_App_Users` is then read for an explicit Admin
Hub or PACE authorization field. If those explicit columns are not present, the
current migration behavior permits an active `Administrator` from `IEP_Users2`;
this fallback should be removed or formally time-limited before broader use.

The current production Graph client is read-only. Its source list is
`IEP_Pace_Visits`; it resolves SharePoint schemas at runtime and uses the
verified quoted date literals plus the `Prefer: HonorNonIndexedQueriesWarningMayFailRandomly`
request header for date filtering. The Phase 2 request method can issue
non-GET requests only behind `PRODUCTION_ADMIN_WRITES_ENABLED`, which remains
`false`.

### MAC-Walkthrough

MAC-Walkthrough uses the same client ID and tenant authority, but requests the
broader delegated `Sites.ReadWrite.All` scope. Its sign-in path reads
`IEP_Users2` for active identity and role, then reads `IEP_App_Users` for
`Admin Panel`. A failed permission lookup denies access; a missing row still
has a temporary Administrator fallback.

The shared registration means the existing consent and app registration may be
reusable as an identity foundation, but it does not by itself approve Admin Hub
source mutations. The Entra administrator must confirm the registered redirect
URIs, delegated consent, and whether any permission change is acceptable for
both applications. Admin Hub should continue requesting only the permissions
it needs until that decision is recorded.

### SharePoint permissions observed

`IEP_Pace_Visits` inherits site permissions. The observed groups include:

- `IEP Admin` — Full Control
- `IEP_Skook Owners` — Full Control
- `IEP_Skook Members` — Edit
- `IEP_Skook Visitors` — Read

This is a significant security concern: application UI hiding is not a
security boundary while ordinary members retain SharePoint Edit access. Any
production source-edit design must decide whether direct member edits are
acceptable or whether a tested custom permission level and/or protected service
boundary is required.

## 2. MAC-Walkthrough PACE editing trace

The existing MAC implementation performs these operations:

1. The administrator opens an existing PACE item by its SharePoint item ID.
2. The form edits Student, Room, Time In, Time Out, Teacher Came From, SCM,
   Reason, Intervention Used, Behavior Specialist, and Notes.
3. Duration is recalculated when either time changes.
4. `GRAPH.updatePaceVisit(itemId, displayFields)` resolves the display names to
   current internal column names and sends:

   `PATCH /sites/{site-id}/lists/{pace-list-id}/items/{item-id}/fields`

5. The editor refreshes the PACE read model after the PATCH.

The confirmed source fields written by that form are:

| Display field | Use |
| --- | --- |
| `Student` | Student text value |
| `Room` | PACE room text/choice value when available |
| `Time In`, `Time Out` | Time text values, only included when changed |
| `Duration` | Recalculated minutes when times change |
| `Teacher Came From` | Source classroom/teacher text |
| `SCM Used`/`SCM` | Boolean when the live field is available |
| `Reason` | Comma-joined reason values |
| `Intervention Used` | Comma-joined support values |
| `Behavior Specialist` | Comma-joined specialist values |
| `Notes` | PACE source notes |

The shared Graph helper accepts an optional `If-Match` value, but the PACE edit
caller does not pass the item ETag. The implementation therefore does not
provide the concurrency protection required for a safe administrative editor.
It also does not write a separate administrator identity, reason, previous
value, or operation ID. SharePoint's native `Modified` and `Editor` fields
provide ordinary item metadata, and the PACE list has version history enabled
with 50 versions retained, but that is not an independent administrative audit
record.

MAC-Walkthrough also exposes a `DELETE` request to:

`/sites/{site-id}/lists/{pace-list-id}/items/{item-id}`

The delete button is shown to users allowed through the MAC Admin Panel gate.
This permanent-delete path must not be reused for Admin Hub. The safer
replacement is metadata-only voiding in a separate review list, with the
original PACE item ID preserved.

MAC-Walkthrough's Nurse Intake implementation stores amendment/history values
in its own workflow data, but that pattern is not a PACE audit service and
should not be treated as one without a separate security and retention review.

## 3. Architecture comparison

### A. Delegated browser-based Graph writes

Required changes:

- Obtain written approval to use delegated `Sites.ReadWrite.All`, or another
  delegated permission that is proven sufficient for the exact endpoints.
- Confirm consent and redirect URIs for the shared Entra registration.
- Enforce explicit Admin Hub authorization rather than relying on the current
  Administrator fallback.
- Add `If-Match` to every source PATCH and handle `412 Precondition Failed`.
- Restrict fields, record an operation ID, write review/audit metadata, and
  remove any source DELETE path.
- Resolve whether the inherited `IEP_Skook Members` Edit permission must change.

Advantages: smallest infrastructure change; reuses current MSAL and Graph
client patterns; straightforward pilot using the existing browser.

Risks: delegated scope is broad; the browser holds a token capable of editing
every resource allowed by the consent and user permissions; client-side gates
can be bypassed; notes and audit data are difficult to isolate; there is no
atomic transaction across source, review, and audit lists; direct SharePoint
member edits remain a separate path.

### B. Protected server-side service with narrow resource permissions

Required changes:

- Add a server-side API/function that accepts only the approved Admin Hub
  operations.
- Validate the signed-in administrator and Admin Hub authorization at the
  service boundary; app-only access does not carry an end-user identity.
- Use a dedicated service identity and evaluate selected-resource Graph
  permissions such as `Sites.Selected` or a list-scoped selected permission.
- Assign access only to the required SharePoint site/lists and keep credentials
  and secrets out of browser code.
- Implement ETag-protected source PATCH, separate review/audit writes,
  idempotent operation IDs, structured partial-failure recovery, and logging.
- Define retention, records protection, service ownership, and rollback.

Advantages: least privilege can be scoped to the required resources; the
browser cannot directly issue arbitrary source writes; administrative notes
and audit storage can be isolated; future Nurse Intake and Daily Pulse
workflows can use the same policy-enforcing boundary.

Risks: higher implementation and operational complexity; requires backend
hosting, secret management, monitoring, and a service owner; selected-resource
assignment and application authorization require formal IT review.

### Recommendation

Choose B for production source mutations and preserve the existing Admin Hub
browser Graph client as read-only. It best addresses the observed broad
SharePoint membership, the absence of a PACE audit store, the MAC delete path,
and the need to protect confidential administrative notes.

Enable the workflow in stages:

1. Create and secure the review and audit lists without enabling source edits.
2. Add review-only operations through the protected service, including actor,
   timestamp, reason, and idempotent operation ID.
3. Pilot with synthetic or explicitly approved non-sensitive records.
4. Only after formal approval, add ETag-protected source correction through the
   service. Keep void/restore metadata-only and permanently exclude DELETE.

## 4. SharePoint setup package

The Phase 2 adapter already names the following proposed fields. These are the
proposed display names and internal names. Because SharePoint assigns internal
names when a column is created, the site owner must verify the resulting
internal names through list settings or Graph before service configuration.
Do not silently rename or substitute a field after creation.

### `IEP_Pace_Admin_Reviews`

| Display name | Proposed internal name | Type | Required | Default | Index/unique |
| --- | --- | --- | --- | --- | --- |
| `PACEVisitItemID` | `PACEVisitItemID` | Single line of text | Yes | blank | Indexed, unique |
| `ReviewStatus` | `ReviewStatus` | Choice | Yes | `Unreviewed` | Choices: `Unreviewed`, `Reviewed`, `Needs Follow-Up` |
| `ReviewedBy` | `ReviewedBy` | Single line of text | No | blank | — |
| `ReviewedAt` | `ReviewedAt` | Date and Time | No | blank | — |
| `AdminNotes` | `AdminNotes` | Multiple lines, plain text | No | blank | Restricted |
| `FollowUpNeeded` | `FollowUpNeeded` | Yes/No | Yes | No | — |
| `FollowUpStatus` | `FollowUpStatus` | Choice | Yes | `Open` | Choices: `Open`, `In Progress`, `Resolved` |
| `FollowUpAssignedTo` | `FollowUpAssignedTo` | Single line of text | No | blank | — |
| `FollowUpDueDate` | `FollowUpDueDate` | Date and Time | No | blank | — |
| `IsVoided` | `IsVoided` | Yes/No | Yes | No | Index if queue queries need it |
| `VoidReason` | `VoidReason` | Multiple lines, plain text | No | blank | Restricted |
| `VoidedBy` | `VoidedBy` | Single line of text | No | blank | — |
| `VoidedAt` | `VoidedAt` | Date and Time | No | blank | — |
| `RestoredBy` | `RestoredBy` | Single line of text | No | blank | — |
| `RestoredAt` | `RestoredAt` | Date and Time | No | blank | — |
| `LastReviewedRecordVersion` | `LastReviewedRecordVersion` | Single line of text | No | blank | — |
| `LastOperationId` | `LastOperationId` | Single line of text | No | blank | Indexed |

### `IEP_Pace_Admin_Audit`

| Display name | Proposed internal name | Type | Required | Default | Index/unique |
| --- | --- | --- | --- | --- | --- |
| `PACEVisitItemID` | `PACEVisitItemID` | Single line of text | Yes | blank | Indexed |
| `OperationId` | `OperationId` | Single line of text | Yes | blank | Indexed, unique |
| `ActionType` | `ActionType` | Choice | Yes | `Edit` | Choices: `Edit`, `Review`, `Void`, `Restore` |
| `Actor` | `Actor` | Single line of text | Yes | blank | Authenticated administrator identity |
| `Timestamp` | `Timestamp` | Date and Time | Yes | blank | — |
| `ChangedFields` | `ChangedFields` | Multiple lines, plain text | No | blank | JSON array |
| `PreviousValues` | `PreviousValues` | Multiple lines, plain text | No | blank | Restricted JSON |
| `NewValues` | `NewValues` | Multiple lines, plain text | No | blank | Restricted JSON |
| `Reason` | `Reason` | Multiple lines, plain text | No | blank | Restricted |
| `SourceRecordVersion` | `SourceRecordVersion` | Single line of text | No | blank | — |

Use versioning on both administrative lists, document the retention limit, and
restrict them to the approved administrator/service group. SharePoint list
versioning alone does not make an audit list immutable; a retention/records
control or independently protected audit sink is still required.

### Responsibility checklist

| Action | Responsible party |
| --- | --- |
| Inspect existing list settings, validate the proposed field mapping, run local tests/builds | Admin Hub developer/user |
| Create the two lists and columns; set required/default values; create indexes and unique constraints; enable versioning | SharePoint site owner |
| Restrict review/audit lists and review whether source members may edit or delete | SharePoint site owner, with data-owner approval |
| Confirm Entra app registration, redirect URIs, consent, selected-resource assignments, and service identity | Microsoft Entra administrator |
| Deploy/configure a protected service, secrets, logging, retries, and operational ownership | Backend/service owner |
| Approve source edits, retention/records controls, confidential-note access, and production enablement | IU29 technology/data owner; formal change approval |
| Create or modify SharePoint records | Only the approved production workflow after formal enablement; not this assessment |

The review workflow can be enabled independently from editing original PACE
records. The first release can allow only `Review`, `AdminNotes`, follow-up,
void metadata, and audit writes to the new lists. `IEP_Pace_Visits` remains
read-only until the source-edit service, permissions, ETag behavior, and
approval are complete.

## 5. Reuse and implementation sequence

### Safe reuse

Reusable foundations:

- The existing Entra tenant/client identity, subject to redirect and consent
  verification.
- MSAL sign-in and the active `IEP_Users2` identity lookup.
- `IEP_App_Users` as an explicit application authorization registry, after the
  migration fallback is retired for production administration.
- The existing read-only Graph site/list/schema resolution and PACE mapping.
- SharePoint's source item IDs and native version history as one preservation
  layer.

Do not reuse directly:

- MAC-Walkthrough's broad delegated write scope as a security decision.
- Its PACE `DELETE` operation.
- Its PACE edit caller without ETag input and audit metadata.
- Its Admin Panel flag as an automatic Admin Hub permission.
- Its Nurse Intake JSON amendment/history fields as a PACE audit store.

### Proposed implementation sequence

1. Site owner validates the two-list schema, internal names, indexes, unique
   constraints, versioning, and access groups.
2. Entra administrator confirms whether the shared registration is acceptable,
   records redirect URIs, and approves a dedicated service identity/resource
   assignments.
3. Implement review-only service operations and keep the production mutation
   gate closed for source records.
4. Add tests for authorization, schema mismatch, duplicate keys, audit
   idempotency, ETags, partial failures, and no-delete behavior.
5. Pilot against synthetic or approved non-sensitive data; verify ordinary
   users cannot read administrative notes or audit history.
6. Obtain formal approval for source corrections, then implement the service
   PATCH path with `If-Match` and post-save verification.
7. Retain void/restore as review metadata only; never add a source DELETE path.
8. Re-run tests and both builds before any release. Perform authenticated live
   verification separately from automated tests.

### Proposed commit plan — not executed

The current uncommitted work should remain uncommitted until approved. A
future checkpoint can be separated as:

1. Administrative interface and synthetic workflow.
2. Production Graph request boundary and gated adapters.
3. Regression and adapter tests.
4. Setup, deployment, baseline, and infrastructure documentation.

This separation makes it possible to review the interface and test contracts
without accidentally enabling production mutations.

## 6. Verification performed

- Admin Hub branch and baseline: `production-sharepoint` at `fdc2ad9c`.
- Admin Hub production mutation gate: confirmed `false`.
- Admin Hub source write helpers: remain throwing read-only stubs.
- MAC-Walkthrough: inspected read-only working tree; no files changed.
- SharePoint: no lists created, no permissions changed, and no records modified.
- Entra/Graph comparison: local MSAL configuration and scopes compared in both
  applications.

Automated tests and both build modes are run separately as part of this audit;
the results are reported in the task handoff. A passing local suite is not
authenticated live verification and does not prove that a new administrator
can use the production workflow.

## 7. Unresolved security concerns

- The MAC app's existing `Sites.ReadWrite.All` and PACE `DELETE` path are
  materially broader than the Admin Hub read-only design.
- `IEP_Skook Members` currently has Edit on the source PACE list; a service
  boundary alone does not prevent direct SharePoint edits.
- SharePoint version history is finite and is not an immutable audit record.
- Review/audit writes across separate lists cannot be atomic with a source
  PATCH; partial operations require durable operation IDs and recovery.
- Text identity fields are easy to configure but weaker than governed Person
  fields; changing to Person fields requires tenant-specific Graph testing.
- The current Admin Hub authorization still has a temporary Administrator
  fallback when explicit application fields are unavailable.
- Shared Entra registration reuse must be approved explicitly; same client ID
  does not establish that the new workflow, redirect URI, or permission model
  is approved.
