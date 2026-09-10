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
Privileged operations become server-owned callable commands:
- approve booking
- decline booking
- payment verification (next hardening step)
- refund request
- refund completion
- refund bank-account retrieval for Admin
- subscription changes (next hardening step)
- notification fan-out

Each command must be authenticated, authorized, idempotent, and auditable.

### Refund bank account policy
Athletes must register a refund bank account before a bank-transfer refund can be requested.

Required fields:
- bank code/name
- account holder name
- account number

Privacy rules:
- full account number is sent only to a callable server function.
- server encrypts it with AES-256-GCM using the Firebase secret `REFUND_ACCOUNT_KEY`.
- encrypted payload is stored under server-only `privateRefundAccounts/{athleteId}`.
- user-facing and normal admin refund records contain only a masked value such as `••••1234`.
- a snapshot of the encrypted destination is copied to `privateRefundInstructions/{refundId}` at refund-request time so later profile edits cannot silently redirect an existing refund.
- only an authenticated Admin callable function can decrypt a specific refund instruction.
- viewing full refund bank details generates a server audit record.
- marking a refund paid is idempotent and notifies the athlete.

Callable functions in Phase 2:
- `saveRefundAccount`
- `getRefundAccountSummary`
- `requestRefund`
- `getRefundInstruction` (Admin only)
- `markRefundPaid` (Admin only)
- `approveBooking`
- `declineBooking`

Before Functions deployment, configure:
`firebase functions:secrets:set REFUND_ACCOUNT_KEY`

Never commit the secret value to GitHub, HTML, environment examples, or Realtime Database.

## Phase 3 — frontend modules
Migrate in this order:
1. Athlete shell and My Bookings, including refund-account form and refund request UI
2. Athlete booking flow
3. Coach booking inbox and calendar
4. Coach CRM/chat/finance
5. Admin control center, including refund operations

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
- refund privacy tests prove clients cannot read private bank-account nodes
- Admin refund-detail access creates audit logs
- duplicate refund requests do not create duplicate refunds
- mobile UAT passes
- rollback path is verified
