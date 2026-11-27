# Admin Hub v1.3 Visual Review

Review date: 2026-11-27
Branch: `dev`
Environment: local demo mode with synthetic data only

## Captured views

- [Default visit detail](./admin-hub-v13-visit-detail.png)
- [Review and follow-up](./admin-hub-v13-review-follow-up.png)
- [Flagged visit detail](./admin-hub-v13-flagged-visit.png)
- [Edit submission](./admin-hub-v13-edit-submission.png)
- [Administrative notes](./admin-hub-v13-administrative-notes.png)
- [Record history](./admin-hub-v13-record-history.png)
- [More actions](./admin-hub-v13-more-actions.png)
- [Mobile visit detail](./admin-hub-v13-mobile.png)

Screenshots use the local demo build and fictional records. The detail screenshots are captured from the modal viewport so the review focuses on the task currently selected.

## Verification

- Default detail opens in read-only mode with no editable fields or technical preservation controls.
- The primary status is shown once; viewed state is secondary metadata, and follow-up context is shown separately.
- Review, edit, notes, history and secondary actions each open as dedicated task views with a clear back action.
- Administrative notes remain separate from original staff notes.
- Edit drafts remain open during background refresh, preserve failed-save values, and require confirmation before Escape dismissal.
- Mobile layout keeps the task actions usable without page-level horizontal overflow.
- The existing chart-owned horizontal scrolling behavior remains unchanged.
- Responsive measurements at 1440, 1024, 768 and 390px reported page `scrollWidth` equal to the viewport width in every case. The chart viewport retained `overflow-x: auto` and its 1,322px date-bucket content remained accessible at each width.
- Production write gating and synthetic demo isolation remain unchanged.

## Automated checks

- Unit tests: 86 passed.
- Browser tests: 3 passed.
- JavaScript syntax checks: passed for all repository JavaScript files.
- `git diff --check`: passed.
- `npm run build:production`: passed; generated `APP_ENV = "production"`, `WRITE_ENABLED = false`.
- `npm run build:demo`: passed; generated `APP_ENV = "demo"`, `WRITE_ENABLED = false`.
- Generated configuration was restored to demo mode after validation.

## Outstanding issues

No release-blocking usability issues were found in this local pass. The hosted demo was not changed or revalidated because this review is intentionally local-only pending visual approval.
