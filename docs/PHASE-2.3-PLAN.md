# Coach Di Sprint 5.0 Phase 2.3 — Production Hardening

## Scope
1. Replace multi-listener auth bootstrap with a single auth controller in the new portal runtime to stop login/logout flicker.
2. Coach payout bank account changes remain pending until Admin approval.
3. Admin Platform view shows all bookings, total athlete/customer count, and a coach schedule matrix.
4. Monthly coach subscription is THB 259 via Omise/Opn Payments.
5. Run regression/error cleanup before Production merge.

## Guardrails
- Do not store card numbers in Firebase or Functions. Use Omise.js tokenization.
- Omise secret key is server-only.
- Coach bank account full number is private; UI uses masked value until Admin explicitly reviews.
- Bank account approval, subscription status changes, and billing events are auditable.
- Existing Production main remains unchanged until UAT passes.
