# Customer summary and Group Class updates

The Admin overview now shows the live number of registered athlete accounts, with loading/error states and a link to the existing customer list. The count includes suspended athlete accounts and excludes coaches/admins; it is a count of registered accounts, not deduplicated natural persons. No personal customer data is displayed on the summary.

The old c97 refresh replaced unread Group Class counts with all open classes, immediately restoring the glow after reading. The new extension retains the existing per-account read watermark. Opening the managed Admin coaches page now also marks that menu read.

Athletes see an accessible, scrollable announcement of future open Group Classes with available seats. Each class is identified by coach ID plus class ID, and read announcements persist locally per athlete account. New classes appear on a subsequent entry or live update, without creating any booking or join request. Announcements wait while another dialog is open. A fresh device/browser may show the announcements again. Closed, cancelled, full and already-started classes are excluded.

Create, reschedule and reopen actions reject past starts, including earlier today. Validation runs again when submitting, in Thailand time, using Firebase's server clock offset when available. It delegates successful writes to existing handlers and preserves booking logic and database structure. This is app-side validation: existing older clients/database Rules are unchanged, and are not claimed to provide server-side enforcement of the new time restriction.

Advertising contact copy is smaller; buttons keep a 44 px minimum touch target. The announcement supports dynamic viewport height, safe area and long Thai text. Android versionCode increases from 5 to 6; application ID, SDK settings and signing configuration are unchanged.

The three explicit app-updates includes are the only additional HTML adaptation. The original captured Production hash and 25 asset checks remain enforced. Automated coverage adds date/time, count, read state, modal, duplicate-submit, navigation, and mobile/landscape regression cases. The PR workflow runs the full existing web, Firebase emulator, Android build/lint and instrumentation suites before delivering the new test APK. Physical Fold7 push and live payment UAT remain separate from these isolated tests.
