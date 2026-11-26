# PACE Administrative Review — Production Activation Checklist

Status: local implementation and mocked integration only. This checklist is
the activation handoff; it does not create SharePoint lists, change Microsoft
permissions, enable production writes, or deploy the service.

Use [`SHAREPOINT_ADMIN_SETUP.md`](./SHAREPOINT_ADMIN_SETUP.md) for background
and the implementation boundary. Do not recreate the architecture assessment
here.

## Release boundary

The local service supports historical lookup by the original PACE item ID,
allowlisted source corrections, independent running notes, viewed status,
follow-up, reversible void/restore, and audit history. It uses fixed list and
field mappings, authenticated server-side identity, ETag protection, post-save
verification, operation IDs, and no-delete enforcement.

The review-only release may enable review metadata, notes, follow-up, viewed,
void/restore, and audit storage while source PACE editing remains disabled.
The original-record editing release is a separate approval gate in the same
v1.1 implementation and must not be opened until the service and SharePoint
controls below are verified.

## SharePoint setup — IU29 technology administrator

Create exactly these three lists after data-owner approval. Do not create a
replacement PACE list or a second audit list. Verify the internal names after
creation; SharePoint owns internal-name assignment.

### `IEP_Pace_Admin_Reviews`

One row per original PACE visit. Restrict the list to the approved
administrator group and the service identity. Enable version history and
document the retention limit.

| Display name / proposed internal name | Type | Required | Default | Index / uniqueness |
| --- | --- | --- | --- | --- |
| `PACEVisitItemID` / `PACEVisitItemID` | Single line of text | Yes | Blank | Indexed, unique |
| `ReviewStatus` / `ReviewStatus` | Choice | Yes | `Unreviewed` | `Unreviewed`, `Reviewed`, `Needs Follow-Up` |
| `ReviewedBy` / `ReviewedBy` | Single line of text | No | Blank | — |
| `ReviewedAt` / `ReviewedAt` | Date and Time | No | Blank | — |
| `FollowUpNeeded` / `FollowUpNeeded` | Yes/No | Yes | No | — |
| `FollowUpStatus` / `FollowUpStatus` | Choice | Yes | `Open` | `Open`, `In Progress`, `Resolved` |
| `FollowUpAssignedTo` / `FollowUpAssignedTo` | Single line of text | No | Blank | — |
| `FollowUpDueDate` / `FollowUpDueDate` | Date and Time | No | Blank | — |
| `IsVoided` / `IsVoided` | Yes/No | Yes | No | Index if queue queries need it |
| `VoidReason` / `VoidReason` | Multiple lines, plain text | No | Blank | Restricted |
| `VoidedBy` / `VoidedBy` | Single line of text | No | Blank | — |
| `VoidedAt` / `VoidedAt` | Date and Time | No | Blank | — |
| `RestoredBy` / `RestoredBy` | Single line of text | No | Blank | — |
| `RestoredAt` / `RestoredAt` | Date and Time | No | Blank | — |
| `LastReviewedRecordVersion` / `LastReviewedRecordVersion` | Single line of text | No | Blank | — |
| `LastOperationId` / `LastOperationId` | Single line of text | No | Blank | Indexed |

### `IEP_Pace_Admin_Notes`

One append-only row per administrative note. The service must never update or
delete an existing note. A correction is a new row with `SupersedesNoteID`.

| Display name / proposed internal name | Type | Required | Default | Index / uniqueness |
| --- | --- | --- | --- | --- |
| `NoteID` / `NoteID` | Single line of text | Yes | Blank | Indexed, unique |
| `PACEVisitItemID` / `PACEVisitItemID` | Single line of text | Yes | Blank | Indexed |
| `NoteText` / `NoteText` | Multiple lines, plain text | Yes | Blank | Restricted |
| `Actor` / `Actor` | Single line of text | Yes | Blank | Authenticated UPN |
| `CreatedAt` / `CreatedAt` | Date and Time | Yes | Blank | Indexed |
| `SupersedesNoteID` / `SupersedesNoteID` | Single line of text | No | Blank | Indexed |
| `OperationId` / `OperationId` | Single line of text | Yes | Blank | Indexed, unique |

### `IEP_Pace_Admin_Audit`

One row per administrative operation. Restrict previous/new values and
reasons to the service and authorized administrators. Enable version history;
SharePoint list permissions alone are not immutable audit protection.

| Display name / proposed internal name | Type | Required | Default | Index / uniqueness |
| --- | --- | --- | --- | --- |
| `PACEVisitItemID` / `PACEVisitItemID` | Single line of text | Yes | Blank | Indexed |
| `OperationId` / `OperationId` | Single line of text | Yes | Blank | Indexed, unique |
| `OperationStatus` / `OperationStatus` | Choice | Yes | `Attempted` | `Attempted`, `Succeeded`, `Conflicted`, `Failed`, `Uncertain` |
| `ActionType` / `ActionType` | Choice | Yes | `Edit` | `Edit`, `Review`, `Void`, `Restore` |
| `Actor` / `Actor` | Single line of text | Yes | Blank | Authenticated UPN |
| `Timestamp` / `Timestamp` | Date and Time | Yes | Blank | — |
| `ChangedFields` / `ChangedFields` | Multiple lines, plain text | No | Blank | JSON array |
| `PreviousValues` / `PreviousValues` | Multiple lines, plain text | No | Blank | Restricted JSON object |
| `NewValues` / `NewValues` | Multiple lines, plain text | No | Blank | Restricted JSON object |
| `Reason` / `Reason` | Multiple lines, plain text | No | Blank | Restricted |
| `SourceRecordVersion` / `SourceRecordVersion` | Single line of text | No | Blank | — |

## Responsibility and approval matrix

| Action | Owner | Verification / approval |
| --- | --- | --- |
| Confirm site/list names and data owner | Admin Hub owner + IU29 technology administrator | Written data-owner approval |
| Create the three lists and columns | SharePoint site owner | Verify internal names, required/default settings, indexes, unique constraints |
| Enable version history and retention/record controls | SharePoint site owner / records owner | Record retention and recovery policy; formal approval if records controls are used |
| Restrict list permissions and test ordinary-user denial | SharePoint site owner | Test administrator, ordinary member, and service identities |
| Assign selected Graph resource permissions | Microsoft Entra administrator + SharePoint site owner | Explicit site/list assignment; written security approval; admin consent where required |
| Configure service secrets and authenticated middleware | Backend/service owner | Secret manager only; validate token issuer, audience, tenant, admin allowlist |
| Approve source edit scope and no-delete rule | Data owner + technology/security approver | Formal production enablement approval |
| Run authenticated pilot | Admin Hub owner + approved pilot administrators | Non-sensitive or approved test records; capture acceptance evidence |
| Open production mutation gate | Release owner | Explicit approval after all checks pass |

Admin Hub can read and operate synthetic data locally. It must not create the
live lists or change permissions through this repository. The service must not
accept actor, role, list, site, or arbitrary field identifiers from a request
body.

## Service and Entra activation

1. Host the server-only service behind the registered Admin Hub URL. Browser
   code must not hold Graph application credentials or secrets.
2. Validate the signed-in Entra token for the expected tenant, issuer, and
   audience, then apply the explicit Admin Hub administrator allowlist.
3. Use the least-privileged application permission
   `Lists.SelectedOperations.Selected` for the six fixed lists, or obtain
   explicit security approval for an equivalent selected-resource arrangement.
   The Entra administrator must assign each list explicitly; consent alone is
   not sufficient. Do not add broad tenant-wide write permission.
4. Bind the service to the fixed site and three fixed administrative lists plus
   the existing `IEP_Pace_Visits` list. Do not accept list IDs from callers.
5. Keep the production write gate closed until the review-only pilot passes.
   Open source editing only as a separately approved release step.
6. Verify every source PATCH sends only changed allowlisted fields with
   `If-Match`, re-reads the item, and preserves its original item ID.
7. Verify partial failures return the operation ID and completed stages;
   retries use the same operation ID and do not duplicate audit or note rows.
8. Confirm no source, note, review, or audit operation uses Graph `DELETE`.

## Verification and rollback

- [ ] No live lists, permissions, records, or deployment settings were changed by this local checkpoint.
- [ ] Three lists exist with the exact verified schema above.
- [ ] Version history and retention/recovery policy are recorded.
- [ ] Ordinary PACE users cannot read administrative notes, void reasons, or audit values.
- [ ] Duplicate PACE IDs, note IDs, and operation IDs are rejected.
- [ ] ETag conflict, save verification, partial-operation, and retry tests pass.
- [ ] Review-only pilot passes with approved non-sensitive records.
- [ ] Authenticated source-edit pilot passes separately, if editing is approved.
- [ ] Production build and demo build are both verified; generated config is restored to demo mode.
- [ ] Explicit production enablement approval is recorded.

To roll back, close the production gate, preserve the original PACE item, and
retain the operation ID. Investigate completed stages and retry only after
resolving the failed stage. Recover a source correction through the approved
SharePoint version-history procedure; do not create a replacement item. The
previous deployment remains the rollback option when deployment is eventually
approved.
