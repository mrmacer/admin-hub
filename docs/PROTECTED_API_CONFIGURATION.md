# Protected Admin Hub API Configuration

This document describes the server boundary added for Admin Hub v1.1. It is
an infrastructure handoff, not permission grant or deployment approval.

The checked-in application remains fail-closed:

- `PRODUCTION_ADMIN_WRITES_ENABLED` remains `false` in the browser build.
- The API only enables writes when `ADMIN_HUB_WRITE_ENABLED=true`, the
  authorization registry protection assertion is true, and the audit
  protection assertion is true.
- The API never accepts actor identity, roles, authorization flags, site IDs,
  list IDs, or arbitrary field maps from the browser.
- `DELETE` requests are rejected by the API and the service.

## API hosting

The Vercel-compatible entry point is:

```text
api/admin/pace/[...path].js
```

It exposes the existing service routes under `/api/admin/pace/...`. The
current `server.js` remains a local static-file server and is not the
production API host.

The server validates the Entra bearer token before resolving authorization,
then reads the active identity from `IEP_Users2` and the explicit
`AdminHubAccess` entitlement from `IEP_App_Users`. There is no Administrator
role fallback and the existing `PACE` flag is deliberately ignored.

## Runtime environment contract

These names are consumed by `src/server/runtime-config.js` and must be stored
in the hosting provider’s server-side environment only.

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_HUB_APP_ENV` | Yes | Must be `production` for the protected API. |
| `ADMIN_HUB_GRAPH_TENANT_ID` | Yes | Microsoft Entra tenant ID. |
| `ADMIN_HUB_ENTRA_ISSUER` | Yes | Exact expected token issuer, normally `https://login.microsoftonline.com/<tenant-id>/v2.0`. |
| `ADMIN_HUB_ENTRA_AUDIENCE` | Yes | API application audience. |
| `ADMIN_HUB_GRAPH_CLIENT_ID` | Yes | Server-side Graph application identity. |
| `ADMIN_HUB_GRAPH_CLIENT_SECRET` | Yes | Server-side secret; store as a Vercel secret or approved secret-manager value. |
| `ADMIN_HUB_ALLOWED_ORIGINS` | Yes | Comma-separated exact browser origins allowed to POST to the API. |
| `ADMIN_HUB_GRAPH_SITE_PATH` | Yes | Fixed SharePoint site path: `siu29.sharepoint.com:/sites/IEP_Skook:`. |
| `ADMIN_HUB_AUTHZ_REGISTRY_PROTECTED` | Yes | Must be `true` only after IT verifies ordinary users cannot modify `IEP_App_Users` or `IEP_Users2`. |
| `ADMIN_HUB_AUDIT_PROTECTION_CONFIRMED` | Yes before writes | Must be `true` only after the approved audit retention/protection control is documented. |
| `ADMIN_HUB_WRITE_ENABLED` | Yes before writes | Keep `false` until formal production approval. |
| `ADMIN_HUB_GRAPH_PACE_LIST_ID` | Yes | `a905e5df-624b-4fa1-8460-091e9bd62a22`. |
| `ADMIN_HUB_GRAPH_REVIEWS_LIST_ID` | Yes | `35073e8c-3d6a-428b-a577-f79f890e6e73`. |
| `ADMIN_HUB_GRAPH_NOTES_LIST_ID` | Yes | `b4a9fb52-b006-4bd1-a369-05f632512d74`. |
| `ADMIN_HUB_GRAPH_AUDIT_LIST_ID` | Yes | `2635ec81-5012-475a-a962-ab23299eabbc`. |
| `ADMIN_HUB_GRAPH_APP_USERS_LIST_ID` | Yes | `43bac604-7880-4f0f-aed9-b7f2fea82133`. |
| `ADMIN_HUB_GRAPH_USERS2_LIST_ID` | Yes | `5ff962d7-03b1-464b-84af-f8e332627779`. |

The API uses app-only Graph access. No Graph client secret belongs in the
frontend build or in a committed `.env` file.

## Browser build contract

These values are non-secret build-time values used by the frontend to request
an API token:

| Variable | Purpose |
| --- | --- |
| `ADMIN_HUB_API_AUDIENCE` | API audience exposed by the Entra registration. |
| `ADMIN_HUB_API_SCOPE` | Delegated API scope, for example `api://<api-client-id>/AdminHub.Access`. |

They are emitted into `src/generated-environment.js` only for an explicit
production build. Demo builds emit empty values and do not initialize MSAL,
Graph, SharePoint, or the API.

## Entra configuration

Technology/Entra administrators must:

1. Expose a delegated API scope such as `AdminHub.Access` on the API
   application registration.
2. Grant the browser application that delegated scope with admin consent if
   required by tenant policy.
3. Configure the production redirect origin and API audience exactly.
4. Configure the server application identity for application Graph access.
5. Grant only selected-resource permissions for the six fixed lists: the
   authoritative PACE list, the three administrative lists, `IEP_App_Users`,
   and `IEP_Users2`.
6. Assign the selected permission at the SharePoint resource level; Entra
   consent alone is insufficient.

The server requires read access to both authorization registries in addition
to read/write access needed for the four operational lists. End users retain
the existing delegated `User.Read` and `Sites.Read.All` browser permissions;
they do not receive browser-side Graph write permission.

Microsoft documents four selected-resource roles: `read`, `write`, `owner`,
and `fullcontrol`. The `write` role permits modification of resource metadata
and contents; it is not an append-only guarantee. Treat deletion as possible
until IT has tested the exact SharePoint assignment and API behavior. The
application route and service reject `DELETE`, but application code alone is
not a SharePoint deletion control. Use a tested SharePoint permission model,
retention/record controls, and restricted service ownership before enabling
writes.

References: [selected permissions](https://learn.microsoft.com/en-us/graph/permissions-selected-overview), [Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference), and [list-item deletion](https://learn.microsoft.com/en-us/graph/api/listitem-delete?view=graph-rest-1.0).

## Authorization registry requirements

The live registry must contain an explicit `AdminHubAccess` Yes/No column with
default `No`. Each authorized administrator or Lead BI must have exactly one
matching row by canonical email, must have an active `IEP_Users2` identity,
and must have `AdminHubAccess=true`.

Missing, duplicate, inactive, false, or ambiguous entries fail closed. The
`PACE` field and `Admin Panel` field are not Admin Hub grants. The `IEP Admin`
SharePoint group is not used by this authorization path.

## Audit and recovery requirements

Before opening the write gate, IT must document:

- who owns the service identity;
- who can modify the authorization registries;
- the retention/record control for `IEP_Pace_Admin_Audit`;
- the recovery procedure for source version history;
- the response to partial operations and retry using the same operation ID;
- a non-sensitive authenticated pilot and rollback owner.

SharePoint version history is preservation support, not immutable audit storage.
The service records operation IDs, source ETags, changed fields, previous and
new values, reasons, and canonical actor identities, but it does not make
Full Control assignments safe or immutable.

## Required preservation schema extension

The three live administrative lists were verified before this hardening pass.
The existing audit list does not yet contain the one lifecycle field required
to distinguish an attempted correction from its outcome. Before any production
write approval, an IU29 technology administrator must add this column to
`IEP_Pace_Admin_Audit` through SharePoint:

| Column | Type | Required | Default | Choices | Unique | Index |
| --- | --- | --- | --- | --- | --- | --- |
| `OperationStatus` | Choice | Yes | `Attempted` | `Attempted`, `Succeeded`, `Conflicted`, `Failed`, `Uncertain` | No | Not required by the API |

No list or other column is required. Do not create this column automatically
through the application or change live records during setup. After creation,
verify the internal name, choices, required setting, and default through the
SharePoint interface. The API fails closed with a schema mismatch until this
column is available.

For a source correction, the service now:

1. Reads the source item and current ETag.
2. Computes the exact changed fields and captures original values, intended
   values, actor, reason, timestamp, and operation ID.
3. Creates and re-reads an audit event with `OperationStatus=Attempted`.
4. Refuses to PATCH the source if that preservation event cannot be confirmed.
5. Applies the source PATCH with `If-Match` and re-reads the source.
6. Updates the preservation event to `Succeeded`, `Conflicted`, `Failed`, or
   `Uncertain` as appropriate, preserving the original value fields.

The flow is retryable with the same operation ID. A retry accepts an already
applied correction without issuing a second source PATCH, and refuses to
overwrite a newer correction. SharePoint lists do not provide a transaction
across the source, review, notes, and audit lists; an uncertain result must be
reviewed before retrying.

## Executable infrastructure setup sequence

Production writes remain disabled throughout this sequence. The person marked
`IT` is an IU29 technology or Microsoft Entra administrator; the person marked
`Owner` is the project owner. No step below changes SharePoint permissions or
Entra settings automatically.

### 1. Freeze the write gate — Owner/IT

Keep these values false or unset in both the browser build and API runtime:

```text
ADMIN_HUB_WRITE_ENABLED=false
ADMIN_HUB_AUTHZ_REGISTRY_PROTECTED=false
ADMIN_HUB_AUDIT_PROTECTION_CONFIRMED=false
```

Do not promote a deployment or run an authenticated mutation while any
preservation, authorization, or deletion-control approval is incomplete.

### 2. Add and verify the audit lifecycle column — IT

In SharePoint, open `IEP_Pace_Admin_Audit` → List settings → Columns → Create
column. Create `OperationStatus` as a required Choice column with exactly the
five values in the table above and default `Attempted`. Keep Title optional,
retain version history, and do not remove the existing `OperationId` unique
constraint or its index.

Record the resulting internal name. It should normally be `OperationStatus`;
if SharePoint generates a different internal name, the runtime schema resolver
will use that name automatically after the display name is verified.

### 3. Register the protected API — IT/Entra administrator

Use a dedicated single-tenant API application registration for the server
boundary. Configure:

- One exposed delegated scope named `AdminHub.Access`.
- An application ID URI that produces the configured audience, normally
  `api://<api-application-client-id>`.
- The production browser application as an authorized client for that scope.
- Admin consent for the delegated scope where tenant policy requires it.
- The production redirect origin and existing browser application redirect URI.
- Tenant restriction to tenant ID
  `3276761c-22db-462b-a930-172d155bd795`.

`ADMIN_HUB_ENTRA_AUDIENCE` must exactly match the `aud` claim emitted for this
API. `ADMIN_HUB_API_SCOPE` must be the full delegated scope, for example
`api://<api-application-client-id>/AdminHub.Access`. These two values are
public build-time values; they are not secrets.

Create or designate a separate confidential server application identity for
Graph app-only access. Store its client secret or certificate in the approved
hosting secret store. Never place it in the browser build, repository, or a
committed `.env` file.

For Microsoft Graph, request the least-privileged selected application
permission `Lists.SelectedOperations.Selected` and obtain admin consent. The
selected permission initially grants no list access; each list assignment must
be made separately. Do not use `Sites.ReadWrite.All`, `Sites.FullControl.All`,
or a tenant-wide equivalent. Microsoft documents the selected permission
model in the [selected permissions overview](https://learn.microsoft.com/en-us/graph/permissions-selected-overview)
and the exact permission in the [Graph permissions reference](https://learn.microsoft.com/en-us/graph/permissions-reference).

### 4. Assign the six SharePoint resources — IT/site owner

On `https://siu29.sharepoint.com/sites/IEP_Skook`, assign the server
application identity at list scope using the selected-resource permission
management process:

| List | GUID | Service access required |
| --- | --- | --- |
| `IEP_Pace_Visits` | `a905e5df-624b-4fa1-8460-091e9bd62a22` | `write` for approved source corrections; `read` for review-only deployment |
| `IEP_Pace_Admin_Reviews` | `35073e8c-3d6a-428b-a577-f79f890e6e73` | `write` |
| `IEP_Pace_Admin_Notes` | `b4a9fb52-b006-4bd1-a369-05f632512d74` | `write` |
| `IEP_Pace_Admin_Audit` | `2635ec81-5012-475a-a962-ab23299eabbc` | `write`, plus approved retention/record controls |
| `IEP_App_Users` | `43bac604-7880-4f0f-aed9-b7f2fea82133` | `read` only |
| `IEP_Users2` | `5ff962d7-03b1-464b-84af-f8e332627779` | `read` only |

`write` is required for the service to create/update list items, but it is
not an append-only guarantee. Treat deletion as possible until the selected
assignment, SharePoint role behavior, and retention controls have been tested.
The API rejects `DELETE`, but application code alone cannot enforce a
SharePoint no-delete guarantee. Do not enable writes unless IT documents:

- service identity ownership;
- who can change list permissions and retention settings;
- audit versioning/retention and recovery controls;
- a tested no-delete or compensating-control procedure; and
- rollback ownership.

The authorization registry lists must not be writable by ordinary Members,
Visitors, or Admin Hub end users. Keep the existing `IEP Admin` group
unchanged; it is not used as an Admin Hub grant.

### 5. Configure server runtime variables — IT/Vercel administrator

Set these as server-side production environment variables on the existing
`admin-hub` Vercel project. The API consumes these exact names:

```text
ADMIN_HUB_APP_ENV=production
ADMIN_HUB_GRAPH_TENANT_ID=3276761c-22db-462b-a930-172d155bd795
ADMIN_HUB_ENTRA_ISSUER=https://login.microsoftonline.com/3276761c-22db-462b-a930-172d155bd795/v2.0
ADMIN_HUB_ENTRA_AUDIENCE=<exact API audience>
ADMIN_HUB_GRAPH_CLIENT_ID=<server Graph application client ID>
ADMIN_HUB_GRAPH_CLIENT_SECRET=<server secret in Vercel secret storage>
ADMIN_HUB_GRAPH_SITE_PATH=siu29.sharepoint.com:/sites/IEP_Skook:
ADMIN_HUB_ALLOWED_ORIGINS=https://admin-hub-beige.vercel.app
ADMIN_HUB_AUTHZ_REGISTRY_PROTECTED=false
ADMIN_HUB_AUDIT_PROTECTION_CONFIRMED=false
ADMIN_HUB_WRITE_ENABLED=false
ADMIN_HUB_GRAPH_PACE_LIST_ID=a905e5df-624b-4fa1-8460-091e9bd62a22
ADMIN_HUB_GRAPH_REVIEWS_LIST_ID=35073e8c-3d6a-428b-a577-f79f890e6e73
ADMIN_HUB_GRAPH_NOTES_LIST_ID=b4a9fb52-b006-4bd1-a369-05f632512d74
ADMIN_HUB_GRAPH_AUDIT_LIST_ID=2635ec81-5012-475a-a962-ab23299eabbc
ADMIN_HUB_GRAPH_APP_USERS_LIST_ID=43bac604-7880-4f0f-aed9-b7f2fea82133
ADMIN_HUB_GRAPH_USERS2_LIST_ID=5ff962d7-03b1-464b-84af-f8e332627779
```

The six list IDs and site path are fixed-resource controls, not user input.
The client ID and secret are server-only. `ADMIN_HUB_API_AUDIENCE` and
`ADMIN_HUB_API_SCOPE` may be supplied only to the explicit production build;
they are emitted to browser JavaScript because the browser needs the delegated
scope, but they contain no secret. Demo builds must leave both empty and must
use `npm run build:demo`.

### 6. Verify routing and separation — IT/Owner

The API function is `api/admin/pace/[...path].js`. The existing `vercel.json`
uses `npm run build:production` for the production project. Confirm the
project ID before any deployment:

```text
admin-hub       prj_KtphCadDocCopn2trRwTMXFtAchc
admin-hub-demo  prj_iDI1pJgoc8mODhUBnlRDVJGKPA1B
```

The production project may receive the server-only variables above. The demo
project must use `npm run build:demo`, contain no Graph credentials, contain no
API scope/audience, and retain synthetic-only data. Never copy production
variables to the demo project.

### 7. Perform safe readiness verification — IT/Owner

There is no unauthenticated health endpoint. With writes still disabled:

1. Verify the deployed function returns a safe configuration error rather than
   enabling writes when a required server variable is absent.
2. Complete a non-sensitive authenticated read-only pilot using the production
   browser URL and an approved test procedure. Do not use or print individual
   student records for diagnostics.
3. Confirm Entra token validation, active `IEP_Users2` matching, and explicit
   `AdminHubAccess=true` matching.
4. Confirm the audit schema read includes `OperationStatus` and that the six
   selected-resource assignments resolve successfully.
5. Review Vercel logs for absence of credentials, bearer tokens, or student
   data. The API intentionally emits safe errors only.

Only after the preservation column, registry protection, audit retention,
selected permissions, authenticated pilot, and no-delete controls are approved
may IT set the two protection assertions true. Production write enablement
still requires explicit release approval and a separate change to
`ADMIN_HUB_WRITE_ENABLED=true`.
