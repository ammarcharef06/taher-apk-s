# Phase 6 — Reports, charts, PDF export, and localization

## Included

- Offline reports read directly from the active company's Dexie tables. No online request is required.
- Dashboard indicators and a six-month cash activity chart.
- Reports page with date filters, financial KPIs, monthly cash flow, expense-category breakdown, and tabular totals.
- Chart.js visualizations (bar and doughnut) with responsive layout and RTL legend support.
- Arabic, French, and English locale dictionaries under `apps/web/src/i18n/locales`.
- Locale selector in the application header. The selected locale is persisted locally and updates the document language and text direction.
- PDF export through the browser's native print dialog. Choose **Save as PDF** in the print destination. This preserves browser Arabic shaping and RTL layout without bundling an incomplete Arabic font into a PDF generator.

## Reporting definitions

- Cash balance uses the existing core `calculateCashBalance` function and the company's opening balances.
- Cash receipts and payments use non-deleted cash ledger transactions in the selected date range.
- Expenses are grouped by expense type and use the stored TTC amount.
- Payroll totals exclude carried balances to avoid counting the same unpaid amount again in subsequent months.
- Monthly payroll chart values use recorded wage-payment entries.
- Outstanding advances use the existing `calculateAdvanceBalance` function, including wage deductions up to the report end date.
- Social-security due is the positive difference between declared due and paid amounts in the selected period.
- Active worker count and undelivered archive count are current snapshots, not historical as-of-period counts.

## Install and validate

The repository currently has no `pnpm-lock.yaml`. After pulling the phase changes, run:

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

The new web dependencies are Chart.js and Vue I18n. The install step must generate the lockfile in the developer environment; it is intentionally not fabricated here.

## Manual acceptance checklist

1. Open the dashboard with populated local records while online and offline. Verify the same local figures are shown.
2. Change the language between Arabic, French, and English. Verify the header, navigation, dashboard, and reports page change language; Arabic sets RTL and the other locales set LTR.
3. Verify the report date range rejects an inverted range and that a valid range refreshes the KPIs and both charts.
4. Compare cash balance with the Caisse ledger for the same end date.
5. Compare expense category totals with the Expenses module for the same date range.
6. Verify wage carry-forward is not double-counted in payroll totals and that the monthly chart reflects actual wage payments.
7. Export the report using the print button, select Save as PDF, and verify Arabic text shaping, RTL tables, chart rendering, page breaks, and the company name.
8. Reopen the app and verify the selected language persists.

## Scope note

The locale foundation and translations are currently wired into the global shell, navigation, dashboard, and Phase 6 reports. The pre-existing transactional screens still contain Arabic literals and need their own translation-key migration before those screens can be considered fully localized. No database migration is required for Phase 6.
