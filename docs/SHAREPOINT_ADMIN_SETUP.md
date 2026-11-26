# Admin Hub SharePoint Administrative Setup Guide

Status: design and IT review only. This guide does not create lists, change permissions, change Microsoft Entra configuration, or enable production writes.

## Purpose

Admin Hub currently reads PACE submissions from `IEP_Pace_Visits`. The v1.1 release must support authorized corrections to existing submissions as its primary capability, alongside independent chronological administrative notes, review status, follow-up, and reversible void/restore without deleting the original item.

The original PACE item ID remains the relationship key. Admin Hub must never create a replacement PACE submission or issue a Graph `DELETE` for a PACE submission.

## Existing infrastructure

- SharePoint site: `https://siu29.sharepoint.com/sites/IEP_Skook`
- Authoritative list: `IEP_Pace_Visits`
- Existing Admin Hub Graph scope: delegated `Sites.Read.All`
- PACE list version history: enabled; 50 versions retained
- PACE list permissions: inherited from the site
- Observed groups: `IEP_Skook Members` has Edit, `IEP_Skook Visitors` has Read, and Owners/Admins have Full Control
- Existing administrative review/audit/note lists: none found

The PACE list currently contains the supported source fields used by Admin Hub, including Student, Date, Time In, Time Out, Duration, Staff Member, Reason, Intervention Used, Notes, Teacher Came From, Behavior Specialist, Room, SCM, Return Status, Created and Modified. The current production date query must retain quoted SharePoint date literals and `Prefer: HonorNonIndexedQueriesWarningMayFailRandomly`.

## Proposed review list

Proposed list name: `IEP_Pace_Admin_Reviews`

Create this list only after IT and data-owner approval. Use one row per PACE visit. `PACEVisitItemID` is a single-line text key containing the original SharePoint item ID.

| Display name | SharePoint type | Required | Default | Index/constraint |
| --- | --- | --- | --- | --- |
| PACEVisitItemID | Single line of text | Yes | — | Indexed and enforce unique values |
| ReviewStatus | Choice | Yes | Unreviewed | Unreviewed; Reviewed; Needs Follow-Up |
| ReviewedBy | Single line of text | No | — | Store authenticated UPN/display identity written by the adapter |
| ReviewedAt | Date and Time | No | — | — |
| FollowUpNeeded | Yes/No | Yes | No | — |
| FollowUpStatus | Choice | Yes | Open | Open; In Progress; Resolved |
| FollowUpAssignedTo | Single line of text | No | — | — |
| FollowUpDueDate | Date and Time | No | — | — |
| IsVoided | Yes/No | Yes | No | Indexed if queue queries require it |
| VoidReason | Multiple lines of text, plain text | No | — | — |
| VoidedBy | Single line of text | No | — | — |
| VoidedAt | Date and Time | No | — | — |
| RestoredBy | Single line of text | No | — | — |
| RestoredAt | Date and Time | No | — | — |
| LastReviewedRecordVersion | Single line of text | No | — | Stores the source ETag/version observed at review |
| LastOperationId | Single line of text | No | — | Indexed for retry diagnostics |

Identity fields are text deliberately: the browser adapter can write the authenticated UPN without relying on undocumented person-field payload conventions. If IT requires Person or Group columns, the adapter must be updated and tested with the tenant’s actual lookup behavior before production enablement.

The review list must be restricted to the authorized administrator group. Ordinary PACE Room Tracker users must not receive access to void reasons, administrative notes, or audit details.

## Proposed running-notes list

Proposed list name: `IEP_Pace_Admin_Notes`

Use one row per administrative note. This dedicated list is preferable to a
single multiline field on the review row because it preserves chronological
entries, allows multiple administrators to contribute without overwriting one
another, and supports append-only service behavior. The service must never
update or delete an existing note. A correction creates a new row referencing
the prior note.

| Display name | Proposed internal name | SharePoint type | Required | Default | Index/constraint |
| --- | --- | --- | --- | --- | --- |
| NoteID | `NoteID` | Single line of text | Yes | — | Indexed and enforce unique values |
| PACEVisitItemID | `PACEVisitItemID` | Single line of text | Yes | — | Indexed |
| NoteText | `NoteText` | Multiple lines of text, plain text | Yes | — | Restricted |
| Actor | `Actor` | Single line of text | Yes | — | Authenticated administrator identity |
| CreatedAt | `CreatedAt` | Date and Time | Yes | — | Indexed for chronological retrieval |
| SupersedesNoteID | `SupersedesNoteID` | Single line of text | No | blank | Indexed; prior note reference |
| OperationId | `OperationId` | Single line of text | Yes | — | Indexed and enforce unique values |

The internal names above are proposed names and must be verified after list
creation because SharePoint owns internal-name assignment. `OperationId`
provides retry idempotency; `NoteID` is the stable note identifier shown to
the application. Restrict this list to the approved administrator/service
group and apply the selected retention/records control.

## Proposed audit list

Proposed list name: `IEP_Pace_Admin_Audit`

Use one row per administrative operation. `OperationId` must be unique and indexed so retries can detect an already-recorded event.

| Display name | SharePoint type | Required | Default | Index/constraint |
| --- | --- | --- | --- | --- |
| PACEVisitItemID | Single line of text | Yes | — | Indexed |
| OperationId | Single line of text | Yes | — | Indexed and enforce unique values |
| OperationStatus | Choice | Yes | Attempted | Attempted; Succeeded; Conflicted; Failed; Uncertain |
| ActionType | Choice | Yes | Edit | Edit; Review; Void; Restore |
| Actor | Single line of text | Yes | — | Authenticated administrator identity |
| Timestamp | Date and Time | Yes | — | — |
| ChangedFields | Multiple lines of text, plain text | No | — | JSON array or line-separated names |
| PreviousValues | Multiple lines of text, plain text | No | — | JSON object; restricted access |
| NewValues | Multiple lines of text, plain text | No | — | JSON object; restricted access |
| Reason | Multiple lines of text, plain text | No | — | Correction, review, or void reason |
| SourceRecordVersion | Single line of text | No | — | Source ETag/version observed |

SharePoint list permissions and ordinary administrator access do not make this list immutable. Administrators with Edit or Full Control can still modify or delete audit items. If audit integrity is required, IT must add an approved control such as Microsoft Purview retention/record controls, a restricted append-only service identity, or an external audit sink with independent retention. Document the selected retention and recovery policy before enabling writes.

## Source record preservation

Native PACE version history is the first preservation layer. Graph supports reading list-item versions, and SharePoint retains versions according to configured limits; it is not an unlimited backup. The current list retains 50 versions. The adapter uses `If-Match` with the source ETag so stale edits fail with a concurrency error instead of overwriting a newer change.

The administrative workflow must:

1. Read the current source item and ETag.
2. Persist and re-read an `Attempted` audit preservation event containing the
   original values, intended values, actor, reason, timestamp, and operation ID.
3. Refuse the source PATCH if preservation cannot be confirmed.
4. Send only changed source fields with `If-Match`.
5. Re-read and verify the saved fields.
6. Write review metadata and append-only note rows when requested, then update
   the preservation event with the actual outcome.
7. Report partial completion if the separate list writes do not all succeed.
8. Permit a retry with the same operation ID; duplicate audit events must be detected.

There is no atomic transaction across the PACE, review, notes, and audit lists.
A partial-operation error is therefore a normal recoverable state, not a
successful save.

## Permission recommendation for IT review

### Preferred architecture: protected service boundary

Use a small server-side API or function for production mutations. Keep Microsoft Graph credentials and any application secret out of browser code. The API should validate the signed-in administrator, apply the Admin Hub allowlist, enforce the write gate, perform ETag-protected updates, append running notes without update/delete operations, and write review/audit records.

For the service identity, use the least-privileged Microsoft Graph application
permission `Lists.SelectedOperations.Selected`, assigned only to the six
required SharePoint lists. Microsoft documents that selected permissions
require explicit resource assignment and do not automatically grant access.
The API must still enforce user authorization because app-only access has no
end-user identity.

### Delegated browser alternative

Direct browser PATCH calls require delegated `Sites.ReadWrite.All` for the Microsoft Graph list-item update API. That permission is broader than the current `Sites.Read.All` scope and must not be added without written IT approval and administrator consent. The current app is not authorized to make these calls.

The existing inherited `IEP_Skook Members` Edit permission also means members can edit the source list directly outside Admin Hub. A custom SharePoint permission level can be evaluated that permits editing without the Delete Items permission, but IT must verify the behavior in both SharePoint and Graph and apply it to the intended administrator group. Admin Hub UI hiding is not a security boundary.

### Required IT decisions

- Service boundary versus direct delegated browser writes.
- Exact selected-resource permission model and resource assignments.
- Whether `IEP_Pace_Visits` permissions must be changed to prevent non-admin direct edits.
- Whether a custom no-delete permission level is acceptable and tested.
- Administrator group for the review and audit lists.
- Whether identity fields remain text or become Person/Group fields.
- Retention/records controls for audit history and recovery.
- Admin consent, pilot users, and rollback owner.

Microsoft references:

- [Update a listItem](https://learn.microsoft.com/en-us/graph/api/listitem-update?view=graph-rest-1.0) — delegated update permission and `If-Match` behavior.
- [Listing versions of a listItem](https://learn.microsoft.com/en-us/graph/api/listitem-list-versions?view=graph-rest-1.0) — version history availability and finite retention.
- [Selected permissions overview](https://learn.microsoft.com/en-us/graph/permissions-selected-overview) — selected-resource assignment and delegated/application behavior.
- [Microsoft Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference) — `Sites.ReadWrite.All` and `Sites.Selected` definitions.

## Setup sequence after approval

1. Create `IEP_Pace_Admin_Reviews` with the schema above.
2. Create and index `PACEVisitItemID`; enable unique values.
3. Create `IEP_Pace_Admin_Notes` with the schema above.
4. Create and index `NoteID` and `OperationId`; enable unique values.
5. Create `IEP_Pace_Admin_Audit` with the schema above.
6. Create and index audit `OperationId`; enable unique values.
7. Enable versioning on all administrative lists and record the retention limit.
8. Restrict all administrative lists to the approved administrator group and the service identity, if used.
9. Configure selected Graph permissions or approve delegated write consent.
10. Verify list permissions, append-only note behavior, custom no-delete behavior, and direct Graph PATCH behavior in a non-production pilot.
11. Run the mocked adapter tests and a controlled pilot using non-sensitive test records.
12. Obtain explicit production enablement approval, then change the feature gate in a reviewed release.

## Verification checklist

- [ ] Correct repository and branch confirmed.
- [ ] No lists or columns created by this guide.
- [ ] No Microsoft permissions changed.
- [ ] Review-list unique key rejects duplicate PACE IDs.
- [ ] Audit OperationId unique key rejects duplicate operations.
- [ ] NoteID and note OperationId unique keys reject duplicate notes.
- [ ] Existing administrative notes cannot be updated or deleted by the service.
- [ ] Source PACE item ID is never replaced.
- [ ] Source PATCH uses only changed fields and `If-Match`.
- [ ] Stale ETags return a recoverable conflict.
- [ ] Saved source values are re-read and verified.
- [ ] Review and audit failures surface a partial-operation ID.
- [ ] Retry with the same OperationId is idempotent.
- [ ] No Graph DELETE path exists.
- [ ] Voiding changes metadata only; restoring clears metadata without recreating the PACE item.
- [ ] Ordinary users cannot read administrative notes or audit history.
- [ ] Production feature gate remains disabled until all approvals are complete.

## Rollback and recovery

Before enabling production writes, document the service owner and recovery owner. For a source correction, use the recorded SharePoint version and the approved restore procedure; do not create a replacement PACE item. For a partial operation, retain the OperationId, identify completed stages from the adapter error, inspect the review/audit records, and retry the same operation only after resolving the failed stage. Do not manually create a second audit event with a new operation ID.

If the feature must be disabled, close the production gate and leave the source item intact. Existing review and audit metadata remains subject to the approved SharePoint retention and recovery policy.
