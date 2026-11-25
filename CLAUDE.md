# Admin Hub — Working Guidance

## Project identity

This repository is the Admin Hub PACE dashboard. It is not the MAC-Walkthrough
application.

- Repository: `/Users/greg_macer/Projects/01-IU29/Admin Hub`
- GitHub: `mrmacer/admin-hub`
- Production branch: `production-sharepoint`
- Known-good baseline: `fdc2ad9`
- Production URL: <https://admin-hub-beige.vercel.app>
- Synthetic demo URL: <https://admin-hub-demo.vercel.app>
- MAC-Walkthrough: `/Users/greg_macer/Projects/01-IU29/MAC-Walkthrough` — read-only
  when working on Admin Hub

Read `docs/DEPLOYMENT.md` before any release work and `docs/CHANGELOG.md` for
the release history.

## Environment boundary

Admin Hub has two explicit build environments:

| Environment | Branch | Vercel project | Build | Data |
| --- | --- | --- | --- | --- |
| Production | `production-sharepoint` | `admin-hub` (`prj_KtphCadDocCopn2trRwTMXFtAchc`) | `npm run build:production` | Entra-authenticated, read-only SharePoint PACE data |
| Demo | `dev` | `admin-hub-demo` (`prj_iDI1pJgoc8mODhUBnlRDVJGKPA1B`) | `npm run build:demo` | Synthetic data only |

Production must never fall back to synthetic data. Demo must never access
Microsoft Graph or SharePoint. The generated environment file must be restored
to demo mode after local production-build verification:

```bash
npm run build:demo
```

Never deploy the home directory. Always verify the repository root, branch,
Vercel project ID, and build command before deployment.

## Authentication and data rules

- Preserve Microsoft Entra/MSAL authentication.
- Preserve administrator authorization through the existing authorization flow.
- Preserve deployment protection unless explicitly authorized otherwise.
- `IEP_Pace_Visits` is read-only from Admin Hub.
- Never create, update, or delete SharePoint records as part of dashboard work.
- Never commit credentials, tokens, `.env` files, or generated production
  configuration.
- Do not modify SharePoint permissions or MAC-Walkthrough from this repository.

## Graph date-filter baseline

The verified production implementation uses quoted SharePoint date-field
literals and sends this request header for date-filtered list-item requests:

```text
Prefer: HonorNonIndexedQueriesWarningMayFailRandomly
```

Do not replace this with a generic unquoted `DateTimeOffset` example without
retesting against the real `IEP_Pace_Visits` list. The SharePoint list-field
query previously returned HTTP 400 until this implementation was used.

The current query depends on a non-indexed SharePoint date field. It works at
the current scale, but may become less reliable as the list grows. Investigate
indexed SharePoint columns and a tested migration path before changing the
query or data model.

## Required verification

Before a release, run:

```bash
npm test
rg --files -g '*.js' -g '!node_modules/**' -g '!test/**' | sort | xargs -n1 node --check
npm run build:production
npm run build:demo
```

Confirm the production build contains `APP_ENV = "production"`, then rerun
`npm run build:demo` and confirm the checked-in generated file contains
`APP_ENV = "demo"`.

Distinguish automated test/build results from authenticated live verification.
Do not claim production is working until an authenticated dashboard has loaded
real SharePoint PACE data.

## Safe branch transfer

Shared application changes must be transferred deliberately between production
and demo branches:

1. Keep environment/build configuration changes separate from shared source
   changes whenever possible.
2. Transfer only the intended application files, preferably through a reviewed
   commit or cherry-pick.
3. Do not blindly merge `production-sharepoint` into `dev`; its `vercel.json`
   selects the production build.
4. After transfer, inspect the diff, run both explicit builds, and verify the
   generated environment marker before deploying either target.
5. Confirm the destination Vercel project ID before deployment. A production
   branch push must not be used as a substitute for demo verification.

## Release authority

Production deployment requires explicit approval. Do not commit, push, or
deploy during diagnostic or documentation-only work unless the user asks for
that action.

GitHub operations must use the `gh` CLI. Do not force-push or merge the
production branch into `main`.
