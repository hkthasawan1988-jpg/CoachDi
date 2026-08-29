# Sprint 4.2 QA Report

## Structure
Static single-page `index.html` with Firebase Authentication + Realtime Database. Existing athlete/coach/admin roles preserved.

## Changed
- index.html
- database.rules.json

## Added nodes
- coachSlotLocks/{coachId}/{date}/{hour}
- coachCalendar/{coachId}/{bookingId}
- coachCustomerNotes/{coachId}/{athleteId}

## Logic
Approval reloads booking, validates status/payment, checks overlap, enforces a minimum 45-minute inter-venue buffer, acquires a Firebase transaction slot lock, confirms booking, writes coach calendar projection, transaction ledger, athlete notification, system chat message, and removes the payment slip after confirmation.

## Security
New nodes are coach-owner/admin scoped. Top-level public access remains closed.

## Known limitations
- No live Maps API yet. When travel matrix data is unavailable, dashboard does not invent a travel duration. Approval still requires at least the configured 45-minute buffer for different venues.
- UAT remains a static HTML app; there is no npm build/lint pipeline in the current codebase. Syntax/JSON/package integrity are tested instead.
- Existing `bookings` broad authenticated read should be split into public busy slots + private booking detail before Production.

## UAT
1. Publish rules. 2. Deploy full ZIP. 3. Login Coach. 4. Test New Booking. 5. Approve. 6. Test duplicate slot. 7. Test travel buffer. 8. Decline. 9. Open CRM. 10. Open Chat in two browsers. 11. Verify Finance uses transactions. 12. Save Profile. 13. Test mobile. 14. Recheck Athlete/Admin.
