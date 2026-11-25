# Admin Hub Deployment Baseline

This document records the known-good production recovery release and the safe
procedure for future releases.

## Known-good production baseline

| Item | Value |
| --- | --- |
| Repository | `mrmacer/admin-hub` |
| Branch | `production-sharepoint` |
| Baseline commit | `fdc2ad9` |
| Vercel project | `admin-hub` |
| Project ID | `prj_KtphCadDocCopn2trRwTMXFtAchc` |
| Live URL | <https://admin-hub-beige.vercel.app> |
| Deployment ID | `dpl_E7d1knVMVsfgScbg1SGRsvZVB2Rs` |
| Build command | `npm run build:production` |
| Build marker | `APP_ENV = "production"` |
| Authentication | Microsoft Entra/MSAL |
| Authorization | Administrator authorization required |
| SharePoint access | Read-only PACE data |

The release was authenticated and verified in the live browser session. The
dashboard loaded real PACE aggregates, showed Connected status, retained the
30 Days default, accepted a 7 Days selection, restored 30 Days, and exposed the
contained Visits Over Time scroll region. No individual student records were
accessed or exported during verification.

## Protected synthetic demo

| Item | Value |
| --- | --- |
| Branch | `dev` |
| Vercel project | `admin-hub-demo` |
| Project ID | `prj_iDI1pJgoc8mODhUBnlRDVJGKPA1B` |
| URL | <https://admin-hub-demo.vercel.app> |
| Build command | `npm run build:demo` |
| Build marker | `APP_ENV = "demo"` |
| Data | Synthetic only |
| Graph access | Disabled |

The production and demo targets are separate Vercel projects. Production is
Git-linked to `main` and the demo is Git-linked to `dev`; pushing
`production-sharepoint` cannot automatically deploy the demo project. Always
verify the project ID before a manual deployment as well.

## Graph date-filter resolution

The production PACE request uses the verified SharePoint-compatible form:

- Date-field literals remain quoted in the `$filter` expression.
- Date-filtered list-item requests include:

  ```text
  Prefer: HonorNonIndexedQueriesWarningMayFailRandomly
  ```

The generic Graph/OData rule for typed `DateTimeOffset` properties must not be
used to revert this implementation. The real SharePoint `IEP_Pace_Visits`
request returned HTTP 400 until the quoted field literals and preference header
were used together.

The preference allows a query over a non-indexed field and may be less reliable
as the dataset grows. Before the list becomes large, investigate indexing the
relevant SharePoint date column or another tested query strategy. Do not change
the current production implementation speculatively.

## Preflight checklist

Before any production release:

```bash
cd "/Users/greg_macer/Projects/01-IU29/Admin Hub"
pwd
git rev-parse --show-toplevel
git status --short --branch
git rev-parse --abbrev-ref HEAD
```

Confirm:

- The working directory is the Admin Hub repository, never `/Users/greg_macer`.
- The intended branch and commit are known.
- Only expected source/test files are modified.
- No credentials, `.env` files, or generated production environment files are
  staged.
- MAC-Walkthrough is not being modified.
- The Vercel project ID is `prj_KtphCadDocCopn2trRwTMXFtAchc`.
- The deployment target is not `admin-hub-demo`.

Inspect the exact diff before staging. Do not modify deployment protection,
Microsoft permissions, or SharePoint records as part of a normal release.

## Validation gates

Run the full automated checks and both builds:

```bash
npm test
rg --files -g '*.js' -g '!node_modules/**' -g '!test/**' | sort | xargs -n1 node --check
git diff --check
npm run build:production
rg 'APP_ENV = "production"' src/generated-environment.js
npm run build:demo
rg 'APP_ENV = "demo"' src/generated-environment.js
```

The final checked-in generated environment must be demo mode. Production must
be selected only by the explicit production build command.

Automated results do not substitute for authenticated live verification.

## Staged production release

Production deployment requires explicit user approval.

1. Verify the project ID immediately before deployment.
2. Deploy to the existing `admin-hub` project only.
3. Use a staged production deployment without assigning the live alias:

   ```bash
   vercel deploy --prod --skip-domain \
     --project prj_KtphCadDocCopn2trRwTMXFtAchc --yes
   ```

4. Inspect the staged deployment and verify:
   - `target` is `production`.
   - The deployment is `READY`.
   - The build logs show `npm run build:production`.
   - `src/generated-environment.js` contains `APP_ENV = "production"`.
   - The deployed Graph client contains the quoted date literals and
     `HonorNonIndexedQueriesWarningMayFailRandomly`.
5. Promote only that verified staged deployment:

   ```bash
   vercel promote <staged-deployment-id> --yes
   ```

Never deploy to `admin-hub-demo`, create another Vercel project, or deploy to
MAC-Walkthrough.

## Production smoke test

Use an authenticated browser session and verify:

- The production alias resolves to the intended deployment.
- Microsoft authentication and administrator authorization succeed.
- The dashboard loads real SharePoint PACE aggregates without HTTP 400.
- 30 Days is the initial range.
- Changing and restoring the date range updates the dashboard.
- Visits Over Time scrolls within its card.
- IU29 branding and teal visual identity remain present.
- PACE records remain read-only.

Do not access, export, or print individual student records for diagnostics. If
sign-in requires user credentials or MFA, ask the user to complete that step
manually and distinguish the result from automated verification.

## Safe transfer between production and demo branches

The branches share application code but must retain different environment
selection and deployment behavior.

- Transfer shared application commits deliberately and review the resulting
  diff.
- Do not blindly merge `production-sharepoint` into `dev`, because the
  production branch carries production build configuration.
- For a demo release, explicitly confirm `npm run build:demo`, synthetic-only
  data behavior, and the demo project ID.
- For a production release, explicitly confirm `npm run build:production`, the
  production project ID, authentication, authorization, and real-data smoke
  verification.
- Never infer environment from the URL, local storage, or a browser query
  parameter.

## Rollback

The prior production deployment is retained as an emergency rollback option:

```bash
vercel promote dpl_BsRyYghqNScijygNd1zfBPUthtcx --yes
```

That deployment predates the successful Graph correction and may restore the
previous HTTP 400 behavior. Treat rollback as a temporary recovery action,
record the active deployment ID, and return to the known-good baseline when the
release issue is resolved.

## Current limitations

- Fresh Microsoft sign-in with other administrators has not been independently
  verified.
- Non-indexed SharePoint date filtering may become less reliable as the dataset
  grows.
- The prior deployment is available for rollback but predates the successful
  Graph correction.
