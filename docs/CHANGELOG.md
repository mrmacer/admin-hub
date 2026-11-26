# Admin Hub Changelog

## 2026-11-25 — Production recovery baseline

Established the known-good production recovery release as the baseline for
future development.

### Baseline

- Commit: `fdc2ad9`
- Branch: `production-sharepoint`
- Vercel project: `admin-hub`
- Project ID: `prj_KtphCadDocCopn2trRwTMXFtAchc`
- Deployment: `dpl_E7d1knVMVsfgScbg1SGRsvZVB2Rs`
- URL: <https://admin-hub-beige.vercel.app>
- Build: `npm run build:production`
- Environment: `APP_ENV = "production"`

### Production behavior verified

- Microsoft Entra/MSAL authentication succeeded in an existing authenticated
  browser session.
- Administrator authorization remained enforced.
- Real SharePoint `IEP_Pace_Visits` data loaded successfully.
- PACE access remained read-only.
- 30 Days remained the default range.
- A 7 Days selection changed the range and metrics; 30 Days restored correctly.
- Visits Over Time remained contained in its horizontally scrollable region.
- IU29 branding and the teal dashboard identity remained present.

### Graph correction

The production PACE query was corrected to use quoted SharePoint date-field
literals and the request header:

```text
Prefer: HonorNonIndexedQueriesWarningMayFailRandomly
```

The first release commit was `f9d58f0` (`Fix Microsoft Graph DateTimeOffset
filtering for production PACE`). Authenticated smoke testing showed that the
generic unquoted DateTimeOffset form still returned HTTP 400 for this real
SharePoint field. The final corrective commit `fdc2ad9`
(`Support SharePoint PACE date filtering`) restored the SharePoint-compatible
quoted literals and added the preference header.

The query currently relies on a non-indexed SharePoint date field. Investigate
indexing and scale behavior before changing this implementation.

### Validation

- 30/30 automated tests passed.
- JavaScript syntax checks passed.
- Production build passed and emitted `APP_ENV = "production"`.
- Demo build passed and emitted `APP_ENV = "demo"` after the production check.
- Authenticated live production verification passed.
- No individual student records were accessed or exported for diagnostics.

## Demo baseline

The protected synthetic demo remains separate:

- Branch: `dev`
- Vercel project: `admin-hub-demo`
- Project ID: `prj_iDI1pJgoc8mODhUBnlRDVJGKPA1B`
- URL: <https://admin-hub-demo.vercel.app>
- Build: `npm run build:demo`
- Environment: `APP_ENV = "demo"`
- Synthetic data only; Microsoft Graph access disabled

The production recovery release did not deploy to or modify the demo target.

## 2026-11-25 — Earlier Admin Hub work retained

The production baseline includes the earlier local application milestones:

- `8e90b28` — Improved PACE chart scrolling and default range.
- `bfd39a8` — Redesigned the Admin Hub dashboard with IU29 branding.
- `cf65f86` — Added the protected SharePoint production branch.

These changes remain part of the documented production baseline. Future work
must preserve the demo/production boundary and the read-only SharePoint model.
