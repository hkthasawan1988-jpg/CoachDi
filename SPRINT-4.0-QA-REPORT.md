# Coach Di Sprint 4.0 — QA Report

## Scope reviewed
- Athlete / Coach / Admin entry points
- Firebase Auth role routing
- Coach profile + profile photo
- Athlete category → coach profile → schedule → court confirm → payment slip → booking
- Coach new booking / payment confirmation
- Athlete notifications, My Bookings, history, chat
- Coach schedule / dashboard / chat
- Admin subscription dashboard / warnings / export
- Realtime Database rules compatibility

## Fixes made in Sprint 4.0
- Athlete private payment-account listener changed to `coachPaymentPublic` to avoid permission errors.
- Athlete own bookings are now loaded independently from the selected coach, so My Bookings / History / Chat do not disappear when changing coaches.
- New Booking cards added to Coach Dashboard.
- Coach confirmation writes coach display name into the booking, creates athlete notification, records payment transaction, and deletes the uploaded slip.
- Athlete history is grouped by month and shows coach, date/time, venue, booking ID and status.
- Athlete My Bookings adds booking selector/ticket above the calendar.
- Realtime chat consolidated into one modern inbox; messages create notifications.
- Notification badge made visible in navigation.
- Coach profile photo remains available and athlete coach cards recognize `photoDataUrl`.
- Subscription lock/dashboard aligned to the canonical `users/{uid}/subscription` structure used by the existing code.
- Admin subscription revenue defaults to MTD and supports date range.
- Admin CSV export for Coach and Athlete history added.
- Booking query indexes added.

## Automated checks performed
- HTML/script extraction and JavaScript syntax validation with Node.js.
- JSON parse validation for `database.rules.json`.
- Static Firebase path/rule review.
- Duplicate override review for the accumulated 3.x patch layers; Sprint 4.0 is intentionally the last override layer.

## Needs real Firebase UAT
The following cannot be truthfully marked passed without using the live accounts/data:
- Actual sign-in for Athlete / Coach / Admin.
- Upload real payment slip and Coach confirmation.
- Browser-to-browser realtime chat delivery.
- Subscription expiry behavior using real dates.
- Netlify production-like deployment/CSP/browser behavior.

## Security note
`bookings` is still readable to any authenticated user because the historical client uses coach-wide booking data to render schedule availability. This is acceptable only for UAT. Before Production, move public busy-time data to a minimal `coachBusySlots` node and restrict full booking records to the athlete, assigned coach, and admin.
