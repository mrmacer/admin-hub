# Admin Hub v1.4 Directory Review

Review scope: synthetic Student Roster and Teachers & Staff management in local demo mode.

## Review result

The local demo supports the requested review surfaces without connecting to live SharePoint directory data:

- Student roster overview with search, status filtering, sorting, active/inactive counts, and stable synthetic IDs.
- Student profile with linked synthetic PACE activity and separate directory history.
- Add and edit student tasks with required identity validation and duplicate warnings.
- Staff overview with role/status filtering, role summary, and synthetic identities.
- Staff profile with linked synthetic PACE activity, descriptive roles, and explicit authorization boundary.
- Edit staff task with history preservation.
- Activate/deactivate lifecycle task with confirmation-safe secondary action and history.
- Browser-local persistence through the existing demo snapshot.
- No-delete directory behavior; inactive records remain available for historical attribution.

## Screenshots

All images below were captured from the local demo with synthetic data only. Desktop captures use the Playwright 1280×720 viewport; the mobile capture uses 390×844.

| View | Screenshot |
| --- | --- |
| Student roster | [admin-hub-v14-student-roster.png](./admin-hub-v14-student-roster.png) |
| Student profile | [admin-hub-v14-student-profile.png](./admin-hub-v14-student-profile.png) |
| Add student | [admin-hub-v14-student-add.png](./admin-hub-v14-student-add.png) |
| Edit student | [admin-hub-v14-student-edit.png](./admin-hub-v14-student-edit.png) |
| Student history | [admin-hub-v14-student-history.png](./admin-hub-v14-student-history.png) |
| Staff overview | [admin-hub-v14-staff-overview.png](./admin-hub-v14-staff-overview.png) |
| Staff profile | [admin-hub-v14-staff-profile.png](./admin-hub-v14-staff-profile.png) |
| Edit staff | [admin-hub-v14-staff-edit.png](./admin-hub-v14-staff-edit.png) |
| Mobile directory layout | [admin-hub-v14-directory-mobile.png](./admin-hub-v14-directory-mobile.png) |

## Verification

- Existing 86 unit tests plus 6 new directory/routing tests: 92 passed.
- Existing 3 browser tests plus 2 new directory browser tests: 5 passed.
- Browser checks covered roster/profile navigation, add, edit, duplicate-safe draft handling, history, lifecycle action stability, and mobile page containment.
- The mobile browser check confirmed `document.documentElement.scrollWidth <= window.innerWidth` at 390px.
- Production routes were not connected or mutated; the directory renderer provides a demo-only guard when `demo` is false.

## Remaining review items

- Live SharePoint field metadata, indexes, permissions, and authoritative staff/student identity joins still require technology-admin verification before any production connection.
- The current synthetic PACE linkage uses display names for demonstrative activity only. Production history should use verified immutable source IDs before directory renames are supported.
- The directory integration preparation and blockers are documented in [`docs/STUDENT_STAFF_DIRECTORY_INTEGRATION.md`](../STUDENT_STAFF_DIRECTORY_INTEGRATION.md).
