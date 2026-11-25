# PACE Administrative Review Rollout

This checklist separates the review-only enablement step from the source-edit
enablement step within the same intended v1.1 release. Editing existing PACE
submissions is the primary release requirement; it is not deferred to a later
product version. The detailed schema and infrastructure assessment remain in [`SHAREPOINT_ADMIN_SETUP.md`](./SHAREPOINT_ADMIN_SETUP.md) and
[`PHASE3_INFRASTRUCTURE_ASSESSMENT.md`](./PHASE3_INFRASTRUCTURE_ASSESSMENT.md).

## Review-only release

Complete these requirements before enabling administrative review in a live
environment:

- Create `IEP_Pace_Admin_Reviews` with a unique indexed `PACEVisitItemID` for
  review status, viewed identity/time, follow-up, and void metadata.
- Create `IEP_Pace_Admin_Notes` with unique note IDs and one append-only row per
  chronological administrative note.
- Create `IEP_Pace_Admin_Audit` with a unique indexed `OperationId`.
- Restrict both lists to the approved administrator/service group.
- Protect administrative notes, void reasons, and audit values from ordinary
  PACE users.
- Enable list versioning and document retention and recovery settings.
- Use a protected service boundary for review, follow-up, void, and restore
  metadata writes.
- Require explicit Admin Hub authorization and record administrator identity,
  timestamp, reason, and operation ID.
- Keep `IEP_Pace_Visits` read-only from Admin Hub.
- Keep the production mutation gate disabled for source-record changes.
- Pilot with synthetic or approved non-sensitive records.
- Verify ordinary users cannot read administrative notes or audit history.

Review operations must not create replacement PACE records and must not issue
Graph `DELETE` requests. Voiding and restoring are metadata operations tied to
the original SharePoint item ID. Notes are append-only; correcting a note
requires a new correction entry that references the prior note.

## Original-record editing enablement

Treat source corrections as a separately gated capability in the same release:

- Approve a server-side authorization architecture and service owner.
- Assign only narrowly scoped Microsoft Graph permissions to the required
  SharePoint resources; do not assume MAC-Walkthrough's delegated
  `Sites.ReadWrite.All` is approved for Admin Hub.
- Decide whether existing SharePoint member Edit access must be reduced or
  replaced with a tested no-delete permission model.
- Require ETag/`If-Match` concurrency protection on every source PATCH.
- Send only explicitly changed fields and re-read to verify the result.
- Record previous values, new values, actor, reason, source version, and
  operation ID in the protected audit store.
- Support the authoritative editable fields: Student, Date, Teacher Came From,
  Room, Behavior Specialist, Time In, Time Out, Reason, Intervention Used,
  SCM, Notes, Return Status, and other fields confirmed by the live schema.
- Allow administrators to use a Custom date range to find historical records
  outside the dashboard's default 30-day analytics window.
- Define recovery for partial operations across the source, review, and audit
  lists.
- Permanently exclude source-record deletion.
- Obtain formal data-owner and technology approval before opening the source
  edit gate.
- Perform authenticated production testing separately from automated tests.

The source-edit release is not complete until the service can PATCH the
existing `IEP_Pace_Visits` item, preserve its stable ID, send only changed
fields, enforce `If-Match`, re-read the saved item, and surface a refresh/review
path for stale records.

For the single actionable handoff with exact list schemas, owners, approvals,
service requirements, verification, and rollback, use
[`ADMIN_REVIEW_PRODUCTION_CHECKLIST.md`](./ADMIN_REVIEW_PRODUCTION_CHECKLIST.md).

## Release gate

Before either release, confirm the working directory, branch, environment,
Vercel project, permissions, and deployment target. Run the complete test suite,
syntax checks, production build, and demo build. Restore the checked-in
generated configuration to demo mode after local validation. Never commit
credentials, tokens, `.env` files, or generated production configuration.
