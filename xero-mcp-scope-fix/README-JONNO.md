# Xero MCP full Read + write fix, 30 September 2026

Takes about 25 minutes of your clicks in total. Nothing here was deployed, and nothing in Xero was changed.

## What is in this folder

| File | What it is |
|---|---|
| `0001-Derive-consent-presets-from-the-tool-map-so-Read-wri.patch` | One git commit against `derekclair/xero-mcp` main (`1bea37a`). Apply with `git am`. |
| `full-scope-fix.diff` | Same change as a plain diff. Apply with `git apply` if `git am` will not. |
| `TOOL-AUDIT.md` | All 55 tools: read/write, Xero endpoint, exact scope, registration status, live visibility. |
| `README-JONNO.md` | This file. |

Verified in the session: `npm run type-check` clean, `npm test` 21 of 21 passing, `wrangler deploy --dry-run` bundles.

## Why create_contact is missing today

Your live worker only holds three accounting scopes: `accounting.contacts.read`, `accounting.invoices`, `accounting.settings.read`. Contacts is read only, so `create_contact` and `update_contact` never register. Bills, credit notes, quotes and purchase orders are also missing even though `accounting.invoices` covers them, which means the worker you deployed on 28 September is your Mac fork with the 17-tool allowlist, not Derek's main. Both things have to change: the scope preset and the allowlist.

## Step 1. Apply the patch to the code you actually deploy (about 5 min)

On the Mac, in the folder you ran `npm run deploy` from on 28 September:

```bash
git status                # make sure you are on your deployed fork
git am /path/to/0001-Derive-consent-presets-from-the-tool-map-so-Read-wri.patch
npm ci --legacy-peer-deps
npm run type-check && npm test
```

If `git am` reports conflicts, use `git am --abort` and then `git apply --3way full-scope-fix.diff`.

Then remove your fork's own narrowing, because the patch cannot see it. Look for and change:

1. **The 17-tool allowlist.** Search for a list containing `xero_whoami`, `list_organisations`, `create_invoice`, `email_invoice` and `list_currencies`. Either delete that allowlist or replace it with `Object.keys(TOOL_SCOPE_MAP)` from `src/auth/scopes.ts`. The scope gate already does deny by default; a second list only hides tools you have paid the scope for.
2. **A narrowed scope preset or override.** Search for `accounting.contacts.read` near `accounting.invoices`. If your fork hard-codes the three-scope list in `scopesForPreset` or `scopeString`, the patch replaces that function. If it is set as the Cloudflare secret `XERO_SCOPES_OVERRIDE`, delete the secret: `npx wrangler secret delete XERO_SCOPES_OVERRIDE`. The new consent page tells you if an override is still active.
3. **Shared token store.** Your token fix stores the Xero tokens per Xero user in `OAUTH_KV`. Make sure a fresh `/callback` overwrites that stored entry (tokens and `scopes`) rather than keeping the old narrow one, otherwise the new consent will be ignored. The gate reads scopes from the session, so the session must be seeded from the new callback.

Run `npm test` again. The new `register-tools.test.ts` fails if any tool is still hidden under Read + write.

## Step 2. Tick the scopes on the Xero app (about 5 min)

1. Open https://developer.xero.com/app/manage and click your app (the one whose client id is in the worker secrets).
2. Open **Configuration**, then the scopes section.
3. Tick exactly these accounting scopes and save:

```
accounting.attachments
accounting.banktransactions
accounting.contacts
accounting.invoices
accounting.payments
accounting.reports.aged.read
accounting.reports.balancesheet.read
accounting.reports.banksummary.read
accounting.reports.executivesummary.read
accounting.reports.profitandloss.read
accounting.reports.trialbalance.read
accounting.settings.read
```

Plus `openid`, `profile`, `email`, `offline_access`. Nothing else. If a scope in this list is not enabled on the app, Xero refuses the whole authorisation with `invalid_scope`.

## Step 3. Deploy (about 3 min)

```bash
npm run deploy
```

Wrangler prints a new version id. Note it. The new build reports version `0.2.0` in the MCP handshake, so you can tell it apart from `0.1.0`.

## Step 4. Re-authorise Xero, once per client (about 5 min each)

A scope change never widens an existing grant. You must remove and re-add the connector so the client gets a fresh session.

**Claude**

1. Open https://claude.ai/settings/connectors.
2. On **Xero Direct** click the menu, then **Remove**.
3. Click **Add custom connector**, name `Xero Direct`, URL `https://jonno-xero-mcp.xero-mcp.workers.dev/mcp`, then **Add**.
4. Click **Connect**. On the xero-mcp consent page choose **Read + write** (expand "Exact Xero scopes requested" to check the 12 scopes above), then **Continue to Xero**.
5. At Xero choose **Consult Clarity** and **Allow access**.

**ChatGPT**

1. Open ChatGPT, then **Settings**, then **Connectors** (Developer mode must be on for a custom MCP server with tools other than search and fetch).
2. Remove the existing Xero Direct connector, then **Create** a new one with the same URL `https://jonno-xero-mcp.xero-mcp.workers.dev/mcp` and OAuth authentication.
3. Complete the same consent: **Read + write**, then **Allow access** at Xero.

Your Work Receipt from 28 September noted that a ChatGPT login "takes over the key and Claude picks it up automatically" in your fork's shared token store. After the second client connects, run `list_granted_scopes` in the first client again to confirm it still shows the full set.

## Step 5. Check (about 3 min, read only)

In either client ask for `list_granted_scopes`. Expected:

- `scopes` lists the 12 accounting scopes plus identity scopes;
- `available_tools` has 55 entries;
- `unavailable_tools` is empty.

Then `xero_whoami`, `list_organisations`, `list_contacts`, `list_invoices`. Do not run a write tool to prove it exists; its presence in the catalogue is the proof.

## What stays protected

- Tokens never leave the worker; `xero_whoami` and `list_granted_scopes` return no tokens.
- Every Accounting call still sends `xero-tenant-id` from a validated `/connections` entry.
- Invoices, bills, credit notes, quotes and purchase orders still default to DRAFT.
- VOIDED and DELETED still need `confirm: true`; `delete_payment` still needs the literal `true`.
- Idempotency keys are still sent on every create.
- Read only stays the default on the consent page and contains no write scope.
- No settings write scope is requested at all, because no tool writes settings.
