# Xero MCP tool audit, 30 September 2026

Source of truth: `derekclair/xero-mcp` main at commit `1bea37a` (files `src/mcp/tools/*.ts`, `src/auth/scopes.ts`), checked by running the real registrars against a recording server.

Totals: 55 tools implemented. 20 write tools, 31 read tools, 4 session tools.

Column key:
- **In map**: tool has an entry in `TOOL_SCOPE_MAP` (a missing entry hides the tool for every session).
- **Registered under Read + write (main)**: the tool registers when Derek's main `readwrite` preset is granted.
- **Covered by your live grant**: your live grant on 30 Sep 2026 was `accounting.contacts.read accounting.invoices accounting.settings.read` plus identity scopes.
- **Visible in live Claude catalogue**: what the `Xero_Direct` connector actually exposed in this session (17 tools).

| Tool | R/W | Xero endpoint | Required scope (any of) | In map | Registered under Read + write (main) | Covered by your live grant | Visible in live Claude catalogue |
|---|---|---|---|---|---|---|---|
| `xero_whoami` | session | GET /connections (identity API) | (signed in) | yes | yes | yes | yes |
| `list_organisations` | session | GET /connections | (signed in) | yes | yes | yes | yes |
| `set_active_organisation` | session | validates tenant against /connections | (signed in) | yes | yes | yes | yes |
| `list_granted_scopes` | session | session props (no Xero call) | (signed in) | yes | yes | yes | yes |
| `list_contacts` | read | GET /Contacts | accounting.contacts.read | yes | yes | yes | yes |
| `get_contact` | read | GET /Contacts/{id} | accounting.contacts.read | yes | yes | yes | yes |
| `create_contact` | write | POST /Contacts (Idempotency-Key) | accounting.contacts | yes | yes | no | NO |
| `update_contact` | write | POST /Contacts/{id} | accounting.contacts | yes | yes | no | NO |
| `list_invoices` | read | GET /Invoices?where=Type=="ACCREC" | accounting.invoices.read | yes | yes | yes | yes |
| `get_invoice` | read | GET /Invoices/{id} | accounting.invoices.read | yes | yes | yes | yes |
| `create_invoice` | write | POST /Invoices (DRAFT default, Idempotency-Key) | accounting.invoices | yes | yes | yes | yes |
| `update_invoice` | write | POST /Invoices/{id} (VOIDED/DELETED need confirm) | accounting.invoices | yes | yes | yes | yes |
| `email_invoice` | write | POST /Invoices/{id}/Email | accounting.invoices | yes | yes | yes | yes |
| `list_bills` | read | GET /Invoices?where=Type=="ACCPAY" | accounting.invoices.read | yes | yes | yes | NO |
| `create_bill` | write | POST /Invoices (DRAFT default, Idempotency-Key) | accounting.invoices | yes | yes | yes | NO |
| `update_bill` | write | POST /Invoices/{id} (VOIDED/DELETED need confirm) | accounting.invoices | yes | yes | yes | NO |
| `list_credit_notes` | read | GET /CreditNotes | accounting.invoices.read | yes | yes | yes | NO |
| `create_credit_note` | write | POST /CreditNotes (DRAFT default, Idempotency-Key) | accounting.invoices | yes | yes | yes | NO |
| `allocate_credit_note` | write | PUT /CreditNotes/{id}/Allocations (Idempotency-Key) | accounting.invoices | yes | yes | yes | NO |
| `list_quotes` | read | GET /Quotes | accounting.invoices.read | yes | yes | yes | NO |
| `create_quote` | write | POST /Quotes (DRAFT default, Idempotency-Key) | accounting.invoices | yes | yes | yes | NO |
| `list_purchase_orders` | read | GET /PurchaseOrders | accounting.invoices.read | yes | yes | yes | NO |
| `create_purchase_order` | write | POST /PurchaseOrders (DRAFT default, Idempotency-Key) | accounting.invoices | yes | yes | yes | NO |
| `list_repeating_invoices` | read | GET /RepeatingInvoices | accounting.invoices.read | yes | yes | yes | NO |
| `list_items` | read | GET /Items | accounting.invoices.read or accounting.settings.read | yes | yes | yes | yes |
| `list_payments` | read | GET /Payments | accounting.payments.read | yes | yes | no | NO |
| `get_payment` | read | GET /Payments/{id} | accounting.payments.read | yes | yes | no | NO |
| `create_payment` | write | PUT /Payments (Idempotency-Key) | accounting.payments | yes | yes | no | NO |
| `delete_payment` | write | POST /Payments/{id} Status=DELETED (confirm literal true) | accounting.payments | yes | yes | no | NO |
| `list_batch_payments` | read | GET /BatchPayments | accounting.payments.read | yes | yes | no | NO |
| `create_batch_payment` | write | PUT /BatchPayments (Idempotency-Key) | accounting.payments | yes | yes | no | NO |
| `list_overpayments` | read | GET /Overpayments | accounting.payments.read | yes | yes | no | NO |
| `allocate_overpayment` | write | PUT /Overpayments/{id}/Allocations (Idempotency-Key) | accounting.payments | yes | yes | no | NO |
| `list_prepayments` | read | GET /Prepayments | accounting.payments.read | yes | yes | no | NO |
| `allocate_prepayment` | write | PUT /Prepayments/{id}/Allocations (Idempotency-Key) | accounting.payments | yes | yes | no | NO |
| `list_bank_transactions` | read | GET /BankTransactions | accounting.banktransactions.read | yes | yes | no | NO |
| `get_bank_transaction` | read | GET /BankTransactions/{id} | accounting.banktransactions.read | yes | yes | no | NO |
| `create_bank_transaction` | write | PUT /BankTransactions (Idempotency-Key) | accounting.banktransactions | yes | yes | no | NO |
| `update_bank_transaction` | write | POST /BankTransactions/{id} (DELETED needs confirm) | accounting.banktransactions | yes | yes | no | NO |
| `list_bank_transfers` | read | GET /BankTransfers | accounting.banktransactions.read | yes | yes | no | NO |
| `create_bank_transfer` | write | PUT /BankTransfers (Idempotency-Key) | accounting.banktransactions | yes | yes | no | NO |
| `list_accounts` | read | GET /Accounts | accounting.settings.read | yes | yes | yes | yes |
| `list_tax_rates` | read | GET /TaxRates | accounting.settings.read | yes | yes | yes | yes |
| `list_tracking_categories` | read | GET /TrackingCategories | accounting.settings.read | yes | yes | yes | yes |
| `list_currencies` | read | GET /Currencies | accounting.settings.read | yes | yes | yes | yes |
| `get_organisation` | read | GET /Organisation | accounting.settings.read | yes | yes | yes | yes |
| `get_profit_and_loss` | read | GET /Reports/ProfitAndLoss | accounting.reports.profitandloss.read | yes | yes | no | NO |
| `get_balance_sheet` | read | GET /Reports/BalanceSheet | accounting.reports.balancesheet.read | yes | yes | no | NO |
| `get_trial_balance` | read | GET /Reports/TrialBalance | accounting.reports.trialbalance.read | yes | yes | no | NO |
| `get_executive_summary` | read | GET /Reports/ExecutiveSummary | accounting.reports.executivesummary.read | yes | yes | no | NO |
| `get_bank_summary` | read | GET /Reports/BankSummary | accounting.reports.banksummary.read | yes | yes | no | NO |
| `get_aged_receivables` | read | GET /Reports/AgedReceivablesByContact | accounting.reports.aged.read | yes | yes | no | NO |
| `get_aged_payables` | read | GET /Reports/AgedPayablesByContact | accounting.reports.aged.read | yes | yes | no | NO |
| `list_attachments` | read | GET /{Entity}/{id}/Attachments | accounting.attachments.read | yes | yes | no | NO |
| `upload_attachment` | write | PUT /{Entity}/{id}/Attachments/{name} | accounting.attachments | yes | yes | no | NO |

## Findings

1. **Derek's main is internally consistent.** All 55 implemented tools have a scope entry and all 55 register under the main `readwrite` preset. No wrong scope names, no read scope used where write is needed, no tool implemented but unregistered.
2. **Your live grant is narrow.** `list_granted_scopes` on the live server returns only `accounting.contacts.read`, `accounting.invoices`, `accounting.settings.read`. Derek's main would have requested 13 accounting scopes for `readwrite`, so the live worker is not running main's preset. Your Work Receipt `rectmQDRMuidTdw0T` records that the deployed source was "hardened locally to a deny-by-default allowlist of 17 tools", and receipt `recIwoNkp4RNI2ZsP` records the later token fix and deploy (version 0bcbbdad). That fork lives on your Mac and in the E2 archive `archive/connector-repair-2026-09-27/xero-repair-2026-09-27.zip`; this session was not permitted to download it.
3. **Two of the 17 live tools are only there by accident of scope.** `create_invoice`, `update_invoice` and `email_invoice` are live because `accounting.invoices` (write) was granted, while `create_contact` and `update_contact` are hidden because only `accounting.contacts.read` was granted.
4. **Even with the full `accounting.invoices` scope, 11 invoice-family tools are missing live** (`list_bills`, `create_bill`, `update_bill`, credit notes, quotes, purchase orders, repeating invoices). Scope is not the reason. The 17-tool allowlist in the deployed fork is.
5. **Derek's main over-requested two scopes** that no tool uses: `accounting.settings` (write; every settings tool is a read) and `accounting.reports.taxreports.read` (no tax report tool). The fix removes both.
6. **Aged receivables / payables** call Xero's `...ByContact` reports, which require `contactID`. The tools accept it as optional; the fix documents that Xero requires it. Calls without it will fail at Xero.
