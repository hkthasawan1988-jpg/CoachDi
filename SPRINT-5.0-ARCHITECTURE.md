# Coach Di Sprint 5.0 — Production Architecture

## Goal
Migrate the current static single-page application toward a maintainable TypeScript application without breaking the current production entry point.

## Migration policy
- `main` stays untouched until UAT passes.
- Existing `index.html` remains the production fallback during Sprint 5.0.
- New code is introduced under `app-v2/` and can be deployed separately for UAT.
- Business rules are extracted into pure TypeScript modules first, then wired to Firebase/server actions.
- No big-bang database migration.

## Phase 1 — foundation
- Vite + TypeScript
- strict compiler settings
- Vitest
- domain models for booking and approval
- isolated V2 build output

## Phase 2 — server boundary
Privileged operations should become server-owned commands:
- approve booking
- decline booking
- payment verification
- refund
- subscription changes
- notification fan-out

Each command must be authenticated, authorized, idempotent, and auditable.

## Phase 3 — frontend modules
Migrate in this order:
1. Athlete shell and My Bookings
2. Athlete booking flow
3. Coach booking inbox and calendar
4. Coach CRM/chat/finance
5. Admin control center

## Booking invariants
Before confirmation:
1. user identity is valid
2. role/ownership is valid
3. booking is still pending
4. payment requirements are met
5. no time overlap exists
6. travel + mandatory buffer is feasible
7. slot lock is acquired atomically
8. status transition is valid
9. transaction/audit/notification projections are written exactly once

## Production gate
Do not merge Sprint 5.0 to `main` until:
- typecheck passes
- unit tests pass
- athlete/coach/admin regression tests pass
- Firebase rules emulator tests cover booking access
- duplicate-approval and concurrent-slot tests pass
- mobile UAT passes
- rollback path is verified
