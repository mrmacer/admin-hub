# PACE Administrative Review Rollout

This checklist separates the review-only workflow from any future editing of
original PACE submissions. The detailed schema and infrastructure assessment
remain in [`SHAREPOINT_ADMIN_SETUP.md`](./SHAREPOINT_ADMIN_SETUP.md) and
[`PHASE3_INFRASTRUCTURE_ASSESSMENT.md`](./PHASE3_INFRASTRUCTURE_ASSESSMENT.md).

## Review-only release

Complete these requirements before enabling administrative review in a live
environment:

- Create `IEP_Pace_Admin_Reviews` with a unique indexed `PACEVisitItemID`.
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
the original SharePoint item ID.

## Original-record editing release

Treat source corrections as a separate approval and implementation:

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
- Define recovery for partial operations across the source, review, and audit
  lists.
- Permanently exclude source-record deletion.
- Obtain formal data-owner and technology approval before opening the source
  edit gate.
- Perform authenticated production testing separately from automated tests.

## Release gate

Before either release, confirm the working directory, branch, environment,
Vercel project, permissions, and deployment target. Run the complete test suite,
syntax checks, production build, and demo build. Restore the checked-in
generated configuration to demo mode after local validation. Never commit
credentials, tokens, `.env` files, or generated production configuration.
