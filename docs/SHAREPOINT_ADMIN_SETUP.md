# Admin Hub SharePoint Administrative Setup Guide

Status: design and IT review only. This guide does not create lists, change permissions, change Microsoft Entra configuration, or enable production writes.

## Purpose

Admin Hub currently reads PACE submissions from `IEP_Pace_Visits`. Phase 2 prepares a controlled administrative workflow for correcting existing submissions, recording independent administrative notes, reviewing records, tracking follow-up, and voiding/restoring records without deleting the original item.

The original PACE item ID remains the relationship key. Admin Hub must never create a replacement PACE submission or issue a Graph `DELETE` for a PACE submission.

## Existing infrastructure

- SharePoint site: `https://siu29.sharepoint.com/sites/IEP_Skook`
- Authoritative list: `IEP_Pace_Visits`
- Existing Admin Hub Graph scope: delegated `Sites.Read.All`
- PACE list version history: enabled; 50 versions retained
- PACE list permissions: inherited from the site
- Observed groups: `IEP_Skook Members` has Edit, `IEP_Skook Visitors` has Read, and Owners/Admins have Full Control
- Existing administrative review/audit list: none found

The PACE list currently contains the supported source fields used by Admin Hub, including Student, Date, Time In, Time Out, Duration, Staff Member, Reason, Intervention Used, Notes, Teacher Came From, Behavior Specialist, Room, SCM, Created and Modified. The current production date query must retain quoted SharePoint date literals and `Prefer: HonorNonIndexedQueriesWarningMayFailRandomly`.

## Proposed review list

Proposed list name: `IEP_Pace_Admin_Reviews`

Create this list only after IT and data-owner approval. Use one row per PACE visit. `PACEVisitItemID` is a single-line text key containing the original SharePoint item ID.

| Display name | SharePoint type | Required | Default | Index/constraint |
| --- | --- | --- | --- | --- |
| PACEVisitItemID | Single line of text | Yes | — | Indexed and enforce unique values |
| ReviewStatus | Choice | Yes | Unreviewed | Unreviewed; Reviewed; Needs Follow-Up |
| ReviewedBy | Single line of text | No | — | Store authenticated UPN/display identity written by the adapter |
| ReviewedAt | Date and Time | No | — | — |
| AdminNotes | Multiple lines of text, plain text | No | — | — |
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

The review list must be restricted to the authorized administrator group. Ordinary PACE Room Tracker users must not receive access to `AdminNotes`, void reasons, or audit details.

## Proposed audit list

Proposed list name: `IEP_Pace_Admin_Audit`

Use one row per administrative operation. `OperationId` must be unique and indexed so retries can detect an already-recorded event.

| Display name | SharePoint type | Required | Default | Index/constraint |
| --- | --- | --- | --- | --- |
| PACEVisitItemID | Single line of text | Yes | — | Indexed |
| OperationId | Single line of text | Yes | — | Indexed and enforce unique values |
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
2. Send only changed source fields.
3. Re-read and verify the saved fields.
4. Write review metadata and an audit event using the same operation ID.
5. Report partial completion if the separate list writes do not all succeed.
6. Permit a retry with the same operation ID; duplicate audit events must be detected.

There is no atomic transaction across the PACE, review, and audit lists. A partial-operation error is therefore a normal recoverable state, not a successful save.

## Permission recommendation for IT review

### Preferred architecture: protected service boundary

Use a small server-side API or function for production mutations. Keep Microsoft Graph credentials and any application secret out of browser code. The API should validate the signed-in administrator, apply the Admin Hub allowlist, enforce the write gate, perform ETag-protected updates, and write review/audit records.

For the service identity, evaluate Microsoft Graph selected-resource permissions such as `Sites.Selected` or the newer list-scoped `Lists.SelectedOperations.Selected`, assigned only to the required SharePoint resources. Microsoft documents that selected permissions require explicit resource assignment and do not automatically grant access. The API must still enforce user authorization because app-only access has no end-user identity.

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
3. Create `IEP_Pace_Admin_Audit` with the schema above.
4. Create and index `OperationId`; enable unique values.
5. Enable versioning on both administrative lists and record the retention limit.
6. Restrict both lists to the approved administrator group and the service identity, if used.
7. Configure selected Graph permissions or approve delegated write consent.
8. Verify list permissions, custom no-delete behavior, and direct Graph PATCH behavior in a non-production pilot.
9. Run the mocked adapter tests and a controlled pilot using non-sensitive test records.
10. Obtain explicit production enablement approval, then change the feature gate in a reviewed release.

## Verification checklist

- [ ] Correct repository and branch confirmed.
- [ ] No lists or columns created by this guide.
- [ ] No Microsoft permissions changed.
- [ ] Review-list unique key rejects duplicate PACE IDs.
- [ ] Audit OperationId unique key rejects duplicate operations.
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
