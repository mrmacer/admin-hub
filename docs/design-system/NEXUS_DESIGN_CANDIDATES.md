# Nexus Design Candidates

Candidate patterns extracted from the implemented Admin Hub v1.3 demo. These are observations for a future Nexus Design System, not finalized standards.

Scope reviewed: PACE Overview, Activity Log, responsive shell, synthetic administrative workflow, and PACE Visit Detail task views.

## Status of this document

| Classification | Meaning |
|---|---|
| Implemented | Present in the current Admin Hub code and verified by tests or browser review. |
| Candidate | A useful pattern that may be reusable in future applications after API and accessibility review. |
| Proposed improvement | Not implemented here; a future design-system opportunity or cleanup. |

## 1. Visual foundation

### Color palette — Implemented

Source: `styles.css`, `:root`.

| Token | Value | Current purpose |
|---|---|---|
| `--ink` | `#172b4d` | Primary body text. |
| `--muted` | `#64748b` | Secondary text, labels and descriptions. |
| `--line` | `#e2e8f0` | Default borders and separators. |
| `--surface` | `#ffffff` | Cards and panels. |
| `--canvas` | `#f3f6fa` | Application background. |
| `--navy` | `#102a43` | Shell, headings and high-contrast structural surfaces. |
| `--blue` / `--teal` | `#0f766e` | Primary action, active navigation and operational emphasis. |
| `--blue-dark` | `#115e59` | Primary button hover state. |
| `--blue-soft` / `--teal-soft` | `#ccfbf1` | Teal-tinted backgrounds and focus accents. |
| `--summary-accent` | `#475569` | Read-only visit summary. |
| `--summary-bg` | `#f8fafc` | Read-only visit summary background. |
| `--review-accent` | `#b45309` | Review and follow-up attention. |
| `--review-bg` | `#fffbeb` | Review and follow-up background. |
| `--correction-accent` | `#0f766e` | Historical submission corrections. |
| `--correction-bg` | `#f0fdfa` | Correction task background. |
| `--notes-accent` | `#2563eb` | Administrative notes. |
| `--notes-bg` | `#eff6ff` | Administrative notes background. |
| `--history-accent` | `#7c3aed` | Record history. |
| `--history-bg` | `#f5f3ff` | Record history background. |
| `--void-accent` | `#b91c1c` | Void and restore actions. |
| `--void-bg` | `#fef2f2` | Destructive/secondary action background. |

Purpose: functional areas have a visual signal while retaining text labels, icons and layout distinctions so color is not the sole communication method.

Dependencies: the current CSS is global and loaded by `index.html`; no theme provider or component package exists.

Reuse potential: high. The semantic accent/background pairs are the strongest current Nexus candidates. Future work should convert the remaining raw colors into named tokens and validate contrast centrally.

### Typography — Implemented

Source: `styles.css`, `:root`, typography selectors.

- Font stack: `Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- Body text is compact and operational, generally `11–13px`.
- Page titles use a responsive `clamp(27px, 3vw, 37px)` scale.
- Modal titles use `21px` desktop and `18px` on narrow screens.
- Eyebrows use `10px`, uppercase, `800` weight and letter spacing around `.13em`.
- Labels use uppercase, `10px`, `700–800` weight.

Candidate: preserve the hierarchy of eyebrow → title → supporting copy, but define a shared type scale and line-height tokens before other applications adopt it.

### Spacing and sizing — Implemented, not tokenized

Sources: `styles.css`, `src/app-shell.js`, `src/modules/pace/pace-views.js`.

Observed values include:

- Shell/sidebar: `240px` sidebar, `250px` content offset, `64px` desktop topbar and `56px` mobile topbar.
- Content: `44px` desktop padding, `28px 18px` at tablet/mobile.
- Common gaps: `8px`, `9px`, `10px`, `14px`, `16px`, `18px`, `22px`, `23px`, `32px`.
- Common radii: `7px`, `8px`, `9px`, `10px`, `11px`, `14px`, `16px`, with `--radius: 10px` for cards.
- Main buttons: minimum height `40px`, horizontal padding `18px`.

Candidate: an 4/8px spacing scale and a small radius scale would reduce drift across applications. This release intentionally keeps the existing hardcoded values.

## 2. Application shell and navigation

### Navy operational shell — Implemented

Source: `src/app-shell.js`, `styles.css` (`.app-frame`, `.sidebar`, `.topbar`, `.brand`, `.nav-item`).

The shell provides a fixed desktop sidebar, a compact topbar, IU29 logo, Admin Hub identity, PACE workspace navigation and connected/synthetic workspace context. The active navigation item uses a teal accent and a left inset indicator on desktop; on narrow screens it becomes a horizontally scrollable navigation row with a bottom indicator.

Dependencies: `currentRoute()` from `src/router.js`; `DEMO_MODE_NOTICE` from `src/demo-data.js`; state-provided `demo` and `userName` values.

Reuse potential: high for internal operational tools, provided labels and route semantics are configurable.

Accessibility: navigation has `aria-label="Main navigation"`; disabled future modules use `aria-disabled`; active state is conveyed with text, color and indicator. Keyboard focus is visible through shared `:focus-visible` rules.

### Synthetic environment banner — Implemented

Source: `src/app-shell.js`, `styles.css` (`.demo-banner`).

Demo mode always exposes a top banner stating that only synthetic data is connected. This is a safety and orientation pattern, not merely branding.

Candidate: make environment banners a first-class shell component with explicit `demo`, `staging` and `production` variants. Keep production warnings and authorization messaging separate from demo messaging.

## 3. Buttons and interactive states

### Primary/secondary action hierarchy — Implemented

Source: `styles.css` (`.button`, `.button.primary`, `.button.secondary`); `src/modules/pace/pace-views.js`.

- Teal primary buttons represent the next or recommended action.
- Pale gray secondary buttons support navigation or lower-priority actions.
- Destructive void actions use the red semantic section and a secondary/danger treatment.
- Compact buttons are used inside dense cards and task views.
- Hover is used for primary buttons and clickable cards; focus is expressed through a visible 3px teal outline.

Candidate: define explicit pressed, disabled, loading and high-contrast states. The current implementation does not provide a complete shared state matrix.

### Entry-card actions — Implemented

Source: `src/modules/pace/pace-views.js` (`detailView()`), `styles.css` (`.detail-entry*`).

Editing, notes, history and more actions are presented as full-width semantic entry cards rather than a dense row of technical controls. Each card has a text label, short explanation, icon and arrow affordance.

Dependency: modal view state in `src/main.js`.

Reuse potential: high for record-centric applications with multiple administrative tasks.

## 4. Semantic sections and status language

### Color-coded task sections — Implemented

Sources: `src/modules/pace/pace-views.js` (`taskHeader()`, `detailView()`, `reviewView()`, `notesView()`, `historyView()`, `moreView()`); `styles.css` (`.task-view-*`, `.detail-entry-*`).

Each task view has a recognizable icon, eyebrow, title, explanation and dedicated semantic tone:

- Summary: slate, read-only context.
- Review/follow-up: amber, unresolved attention.
- Correction: teal, controlled historical change.
- Notes: blue, contextual administrative record.
- History: purple, preserved audit trail.
- More actions/void: red, less-common or destructive action.

The meaning is also written in headings and descriptions, so the visual treatment is not color-dependent.

### Primary attention status — Implemented

Sources: `src/modules/pace/pace-views.js` (`primaryAttentionStatus()`, `statusSummary()`); `src/modules/pace/pace-admin.js` for underlying values; `test/pace-layout.test.js`.

Presentation mapping currently prioritizes:

1. `Voided`.
2. Follow-up `Needs Review`.
3. Follow-up `In Review`.
4. Follow-up `Follow-Up Complete`.
5. Legacy review `Needs Follow-Up`.
6. Legacy review `Reviewed`.
7. Default attention label `Needs Review`.

`Viewed`/`Not viewed` is rendered as secondary metadata. Follow-up context is separately labeled when it remains active. Stored review and follow-up values remain distinct.

Candidate: standardize a cross-application status vocabulary and a documented precedence table. Any future mapping must preserve the distinction between viewed state, review status, follow-up status and voided state.

### Status indicators — Implemented

Source: `styles.css` (`.status-badge`, `.status-meta`, `.status-context`, `.status-*`).

Indicators use short text labels, tinted backgrounds and compact pills. Completed states use teal; unresolved attention uses amber; review-in-progress uses blue; voided uses red.

Potential inconsistency: legacy classes such as `.status-follow-needs-review`, `.status-follow-in-review` and `.status-follow-complete` remain alongside the newer generic classes. They support older surfaces but should be consolidated before a shared package is created.

## 5. Record detail layouts

### Read-only-first visit detail — Implemented

Source: `src/modules/pace/pace-views.js` (`detailView()`), `styles.css` (`.visit-summary-section`, `.detail-grid`, `.detail-field`).

The default detail view answers, in order:

1. Who and when: persistent modal header.
2. What happened: compact two-column summary.
3. Does it need attention: amber review section when applicable.
4. What can I do: semantic entry cards for the relevant administrative tasks.

The default summary does not render editable inputs or the complete review form. Original staff notes are displayed as a read-only field and are distinct from administrative notes.

Reuse potential: high for record review workflows.

### Detail counts and preserved context — Implemented

Source: `src/modules/pace/pace-views.js` (`detailView()`, `notesList()`, `historyView()`).

Administrative note and history counts are shown in entry cards. User-facing copy explains that the original submission is preserved and changes appear in history. Demo persistence is disclosed only in demo mode.

## 6. Dedicated task views

### Modal view-state architecture — Implemented

Sources: `src/main.js` (`state.modalMode`, event handlers); `src/modules/pace/pace-views.js` (`detailModal()`); `styles.css`.

Supported modes are `detail`, `review`, `edit`, `notes`, `history` and `more`. A task action replaces the current modal content inside the same modal; it does not stack another modal. Each task view uses `taskHeader()` and a `Back to Visit` action.

Successful review flags, edits, notes, voids/restores and follow-up transitions return to detail and show concise confirmation text. Failed operations retain the relevant draft and show an error message.

Dependencies: `src/modules/pace/pace-admin.js`, optional `src/admin-api.js` in protected production mode, and `src/modal.js` for dismissal classification.

Reuse potential: high, but the state transitions should become a documented task-view controller rather than remain string-based in a page module.

### Modal scrolling and containment — Implemented

Sources: `styles.css` (`.modal-backdrop`, `.modal`, `.modal-scroll-region`); `src/modal.js`; `src/main.js`.

- The backdrop is fixed and uses `overscroll-behavior: contain`.
- The modal has a viewport-relative maximum height and `overflow: hidden`.
- Only `.modal-scroll-region` scrolls vertically.
- The page is locked with `.modal-open { overflow: hidden; }`.
- The chart uses a separate `.trend-chart-viewport` with `overflow-x: auto` and an inner minimum width based on date buckets.

Candidate: share a modal primitive with explicit header/body/footer slots and documented focus management. The current modal does not yet implement a dedicated focus trap or focus return mechanism.

### Draft preservation — Implemented

Source: `src/main.js` (`captureEditorDraft()`, `restoreEditorDraft()`, `hasUnsavedEdit()`).

Before repaint, the current edit fields are captured. After repaint, values are restored by stable control IDs. Failed saves capture the draft before rendering the error state. Escape, close and backdrop dismissal confirm before discarding unsaved corrections.

Reuse potential: high for any app that re-renders form-heavy views, but it should be extracted into a framework-neutral draft controller with explicit dirty-state tests.

## 7. Forms, validation and feedback

### Form controls — Implemented

Sources: `src/modules/pace/pace-views.js` (`editView()`, `reviewView()`, `notesView()`, `moreView()`); `styles.css` (`.admin-edit-grid`, `.flag-grid`, `.note-entry`, `.admin-void-field`).

Forms use visible labels, native inputs/selects/date fields, short explanatory placeholders and grid layouts that collapse to one column at narrow widths.

### Validation — Implemented

Sources: `src/main.js` mutation handling; `src/modules/pace/pace-admin.js` (`normalizeEditDraft()`, `applyDemoEdit()`); `src/admin-api.js` and production adapters.

The correction reason is required. Invalid or incomplete times are rejected before applying the edit. Duration is recalculated from time values by existing data logic. Production mutations remain fail-closed until the configured gate and authorization checks pass.

Candidate: define shared field-level validation and error-summary patterns. Current errors are generally rendered as a top-level `.admin-error` message rather than attached to individual fields.

### Success and error feedback — Implemented

Sources: `src/main.js`, `styles.css` (`.admin-success`, `.admin-error`, `.admin-warning`).

Success messages are concise and returned to detail after a successful operation. Error messages use `role="alert"`; success messages use `role="status"`. Warnings identify re-review conditions after source changes.

Potential improvement: standardize notification placement, duration and screen-reader announcement behavior across future applications.

## 8. Administrative history and preservation

### Append-only administrative context — Implemented

Sources: `src/modules/pace/pace-admin.js` (`addDemoAdminNote()`, `recordDemoEdit()`, `adminHistoryFor()`); `src/modules/pace/pace-views.js` (`historyView()`, `historyMarkup()`).

Administrative notes are separate from original notes. History entries show action, actor, timestamp, reason and preserved values where available. Void/restore operate on review metadata and do not remove the original PACE visit.

Candidate: preserve this separation in all Nexus record workflows: source content, administrative context and audit trail should have different visual and storage semantics.

## 9. Responsive behavior

### Contained responsive shell — Implemented

Sources: `styles.css` media queries at `1100px`, `850px` and `430px`; `src/modules/pace/pace-views.js` chart markup.

- Desktop uses the fixed sidebar and multi-column panels.
- Tablet reduces KPI/filter grids.
- Mobile replaces the sidebar with a horizontally scrollable nav row, hides nonessential topbar text, stacks detail fields and task cards, and makes the modal full-screen.
- Grid/flex children use `min-width: 0` in the shell, panels and controls.
- The chart owns horizontal scrolling; the page remains contained.

Verified behavior: page `scrollWidth` matched the viewport at 1440, 1024, 768 and 390px; chart content remained wider than its viewport and had `overflow-x: auto`.

Candidate: formalize viewport and breakpoint tokens and add automated layout assertions to a shared visual regression suite.

## 10. Accessibility considerations

### Implemented

Sources: `src/app-shell.js`, `src/modules/pace/pace-views.js`, `src/modal.js`, `styles.css`, browser tests.

- Navigation has an accessible label.
- Demo banner communicates environment context in text.
- Modal uses `role="dialog"`, `aria-modal="true"` and `aria-labelledby="visit-detail-title"`.
- Chart viewport uses `role="region"`, a descriptive `aria-label` and `tabindex="0"`.
- Chart keyboard scrolling supports ArrowLeft and ArrowRight.
- Buttons and form controls have visible labels or accessible names.
- Focus-visible outlines are applied to navigation, buttons, modal close, task entry cards and back actions.
- Unsaved dismissal uses a confirmation prompt.
- Text labels accompany colors and icons.

### Candidate improvements

- Add explicit focus placement when a modal opens and return focus to the triggering record when it closes.
- Add a focus trap for the modal body.
- Add `aria-live` coverage for mutation confirmations and errors through a shared feedback component.
- Review native confirmation prompts for a consistent accessible dialog pattern.
- Add automated contrast checks for every semantic token pair.

## 11. Inconsistencies and future cleanup

These are deliberately not changed during the v1.3 release:

- CSS still contains several raw color values alongside named tokens.
- Spacing, typography and radius values are repeated rather than tokenized.
- Legacy detail-view functions and legacy class names remain in `src/modules/pace/pace-views.js` for compatibility and should be retired only after a separate cleanup review.
- `.modal-close` is declared twice in `styles.css`; the later rule intentionally overrides the earlier absolute positioning.
- Older classes (`.edit-intro`, `.flag-panel`, `.history-disclosure`, `.secondary-actions`) coexist with the dedicated task-view classes.
- HTML strings and CSS selectors are tightly coupled to page-specific IDs and classes.
- Icons are text glyphs rather than a shared icon set.
- The current application has no reusable component package or shared design-token source.

## 12. Proposed Nexus extraction sequence

These are proposed improvements, not part of the current Admin Hub release:

1. Extract color, type, spacing, radius and elevation tokens into a versioned reference artifact.
2. Define accessible primitives for shell, navigation, card, button, status, modal, form feedback and record history.
3. Define a task-view contract for record detail workflows.
4. Add visual and accessibility checks at the shared primitive level.
5. Pilot the primitives in one additional application before migrating Admin Hub or MAC Walkthrough.

No new design-system repository, shared package dependency or application refactor was introduced by this document.
