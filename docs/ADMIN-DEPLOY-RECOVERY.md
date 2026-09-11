# Admin deployment recovery

On 11 September 2026 the Netlify deploy list showed main commit
`7e25792548ecd8f8096932fb9ee295da8c5ff927` published as deploy
`6aa2cfa5c5e32e0008729832`. Automatic main publishing was enabled.
That replaced the manually published complete website from PR #3,
`d6c766125c66a4d6960d2aebdd96d10e7248cc7f` / deploy
`6aa11caae85b860008b3e922`.

The newer main commit has the original index.html and lacks the external Admin
management/transactions assets and subsequent app enhancements. The screenshot
shows its legacy flat sidebar and dashboard, not a narrow viewport issue.
Comparing main with the original base `120abd1feab7359015a07751df2c1127dcceb880`
shows only four added UAT HTML pages. No production data was inspected or changed
to diagnose this deployment regression.

Recovery uses the complete existing PR #3 website and preserves those four UAT
routes byte-for-byte. Their upstream Git blob hashes are recorded in
`preserved-uat.json`; `npm run build:netlify` checks the hashes and includes them.
`npm run build` continues to omit UAT pages from the Android bundle. The UAT pages
are preserved existing work, not new certified production financial flows.

The Admin navigation and summaries already exist in the complete website.
The only app styling change here makes section headings legible on the white
court-theme sidebar. New isolated browser regressions exercise real session
restoration into Admin, grouped navigation, live customer count, coach summaries,
finance navigation and five-day booking/group/manual schedules.

Before manually publishing the recovery preview, require passing checks on its
exact source, verify all website assets and preserved UAT routes, and recheck the
current published deploy for intervening work. Keep main unmerged. Once published,
lock automatic publishing so an older main tree cannot replace the site again;
future Production releases must be deliberate. No Firebase rules, functions,
financial records, signing credentials or account permissions are changed.
