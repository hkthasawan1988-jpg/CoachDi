# Coach Di Sprint 5.0 Phase 2.1 — Refund UI UAT

## Scope
Phase 2.1 connects the secure refund server boundary to an Athlete Refund UI and Admin Refund Center.

## Athlete flow
1. Login with an Athlete account.
2. Open refund account section.
3. Save bank, account name, and account number.
4. UI displays only masked account number.
5. Enter an eligible booking ID and request refund.
6. Server rejects refund when no refund account exists.
7. Athlete sees own refund history and status only.

## Admin flow
1. Login with Admin account.
2. Load Refund Queue through `listRefundQueue` callable function.
3. Filter requested / processing / paid.
4. Start processing through `setRefundProcessing`.
5. View full transfer instruction only through `getRefundInstruction`.
6. Viewing full account number creates a server audit log.
7. Mark paid through `markRefundPaid`.
8. Athlete receives refund-paid notification and booking refund status is updated.

## Privacy
- Full account number is never returned by list APIs.
- `refunds` contains masked account data only.
- Full account number is encrypted with AES-256-GCM under `privateRefundAccounts` and snapshotted under `privateRefundInstructions`.
- Private refund nodes remain inaccessible to browser clients under root default-deny rules.
- Full account disclosure requires Admin role + callable function and is audited.

## Required before UAT
- Deploy Functions from `functions/` to UAT Firebase project or approved UAT environment.
- Configure Firebase secret `REFUND_ACCOUNT_KEY` using a strong random value outside Git/GitHub.
- Confirm the UAT page points to the intended Firebase project before any real data testing.

## UAT tests
- Athlete cannot save invalid 7-digit account number.
- Athlete can overwrite own refund account; UI shows only last 4 digits.
- Athlete without account cannot request refund.
- Athlete cannot request refund for another athlete's booking.
- Duplicate refund request is idempotent.
- Athlete sees only own refunds.
- Coach cannot use Admin Refund Center.
- Admin can list refund queue without seeing full account number.
- Full account is exposed only after explicit Admin action.
- Account-view audit log is written.
- Requested -> Processing transition works once.
- Processing -> Paid works once.
- Duplicate paid action is idempotent.
- Paid action updates booking refundStatus and sends athlete notification.

## Production gate
Do not merge into `main` until Functions typecheck, security tests, privacy tests, athlete UAT, admin UAT, and rollback test pass.
