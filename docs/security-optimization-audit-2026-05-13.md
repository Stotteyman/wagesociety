# Security and Optimization Audit - 2026-05-13

## Scope

This audit focused on removing local auth/admin bypass behavior and documenting current platform optimization opportunities.

## Current State (After Changes)

1. Local root session mechanics were removed from application source code.
2. Client requests no longer send `x-local-root-session`.
3. API auth resolution no longer supports localhost bypass identities.
4. Admin and privileged APIs now depend on normal auth plus role permissions.
5. Fallback behavior in non-service-role environments now returns explicit `503` errors for privileged operations instead of local elevation.
6. OAuth/Kick implementation remains on docs-aligned settings (`id.kick.com`, `user:read`, consent prompt).

## Security Findings

1. High: Local superadmin trust path existed in both browser and server logic.
Current risk before change: Any localhost path with special header/session behavior could produce superadmin access.
Status: Removed from `src` auth flow.

2. High: Privileged APIs accepted local-header shortcuts instead of standard identity checks.
Current risk before change: News, livestream, merch studio, and profile upload routes could execute privileged actions without standard bearer-token role checks.
Status: Removed from `src` route handlers.

3. Medium: APK release API had local filesystem fallback for release operations.
Current risk before change: Local-only branch created inconsistent deployment behavior and policy drift from production controls.
Status: Replaced with explicit "not configured" responses when admin config is missing.

4. Medium: Stale generated mobile web assets still contain legacy local-bypass strings.
Current risk now: Runtime confusion and accidental reuse if stale assets are copied without rebuilding.
Status: Not active in `src`; requires regeneration of mobile web assets.

## Optimization Findings

1. Bundle size warning exists for a large client chunk (~592 kB before gzip).
Recommendation: Introduce route-level or feature-level dynamic imports for heavier dashboard/admin modules.

2. Permission/access checks repeat similar patterns across several API handlers.
Recommendation: Add shared server-side guard utilities for consistent permission and environment handling.

3. Some privileged endpoints are hard-disabled when service-role config is missing.
Recommendation: Define a clear environment policy matrix (dev/staging/prod) and fail-fast at startup for routes that require service role.

4. Role bootstrap behavior is still tied to a hardcoded owner email list.
Recommendation: Move owner bootstrap controls to environment/config storage with documented rotation and audit process.

5. Android embedded asset trees can drift from web source.
Recommendation: Make mobile asset sync part of CI or pre-release checklist so generated assets always match current source.

## Recommended Next Actions

1. Rebuild and sync mobile web assets so stale local-bypass strings are removed from generated bundles.
2. Add integration tests for permission-critical endpoints (`/api/admin/*`, `/api/live/streams`, `/api/merch-studio/*`, `/api/news*`).
3. Add a startup health check that blocks privileged routes if required Supabase admin env vars are absent.
4. Split large dashboard/admin code paths with lazy-loading to reduce initial bundle weight.
5. Create a short security baseline document for auth invariants (no local bypass, bearer token required, role checks mandatory).
