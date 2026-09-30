# Xero MCP full Read + write fix, 30 September 2026

Takes about 25 minutes of your clicks in total. Nothing here was deployed, and nothing in Xero was changed.

## What is in this folder

| File | What it is |
|---|---|
| `0001-Derive-consent-presets-...patch` | Commit 1 against `derekclair/xero-mcp` main (`1bea37a`): presets derived from the tool map. |
| `0002-Gate-tools-by-client-grant-...patch` | Commit 2: each client limited to its own consent even with a shared token store, re-checked on every call. |
| `full-scope-fix.diff` | Both commits as one plain diff. |
| `new-files/` | The six changed or new source and test files, ready to copy into the Mac fork. |
| `FORK-ADAPTATION.md` | File-by-file porting guide for the deployed Mac fork, including how to recover the iCloud-offloaded source. Start here. |
| `TOOL-AUDIT.md` | All 55 tools: read/write, Xero endpoint, exact scope, registration status, live visibility. |
| `README-JONNO.md` | This file. |

Verified on the upstream clone: `npm run type-check` clean, `npm test` 35 of 35 passing, `wrangler deploy --dry-run` bundles. Codex independently confirmed the first 21 on the Mac. Not yet integrated into the Mac fork, not deployed.

## Why create_contact is missing today

Your live worker only holds three accounting scopes: `accounting.contacts.read`, `accounting.invoices`, `accounting.settings.read`. Contacts is read only, so `create_contact` and `update_contact` never register. Bills, credit notes, quotes and purchase orders are also missing even though `accounting.invoices` covers them, which means the worker you deployed on 28 September is your Mac fork with the 17-tool allowlist, not Derek's main. Both things have to change: the scope preset and the allowlist.

## Step 1. Port the change into the Mac fork (about 35 min including source recovery)

The patches do not apply cleanly to your fork, so follow `FORK-ADAPTATION.md`: recover the iCloud-offloaded source (free disk space, Download Now, or copy the folder out of iCloud), then port file by file. Three things in the fork change: the 17-tool allowlist goes, the `XERO_SCOPES_OVERRIDE` entry is removed from `vars` in `wrangler.jsonc` (it is a plain variable, not a secret, so no `secret delete`), and `index.ts` passes the client's own consent and the shared token's scopes separately to `registerAllTools`. The shared-KV login fix and the VOIDED/DELETED block stay exactly as deployed.

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
2. On **Xero Direct** choose **Disconnect** (keep the connector; do not delete it).
3. Choose **Connect**. On the xero-mcp consent page choose **Read + write** (expand "Exact Xero scopes requested" to check the 12 scopes above), then **Continue to Xero**.
4. At Xero choose **Consult Clarity** and **Allow access**.

**ChatGPT**

1. Open ChatGPT, then **Settings**, then **Connectors** (Developer mode must be on for a custom MCP server with tools other than search and fetch).
2. On **Xero Direct** choose **Disconnect**, then **Connect**, and complete the same consent: **Read + write**, then **Allow access** at Xero.

Your Work Receipt from 28 September noted that a ChatGPT login "takes over the key and Claude picks it up automatically" in your fork's shared token store. After the second client connects, run `list_granted_scopes` in the first client again to confirm it still shows the full set.

## Step 5. Check (about 3 min, read only)

In either client ask for `list_granted_scopes`. Expected:

- `scopes` lists the 12 accounting scopes plus identity scopes;
- `client_grant_scopes` equals `upstream_token_scopes` and `withheld_from_this_client` is empty;
- `available_tools` has 55 entries;
- `unavailable_tools` is empty.

Do this in Claude and again in ChatGPT. Whichever client connected second replaced the shared Xero tokens; the first client keeps only what its own consent allows, which is the isolation rule the new tests cover.

Then `xero_whoami`, `list_organisations`, `list_contacts`, `list_invoices`. Do not run a write tool to prove it exists; its presence in the catalogue is the proof.

## What stays protected

- Tokens never leave the worker; `xero_whoami` and `list_granted_scopes` return no tokens.
- Every Accounting call still sends `xero-tenant-id` from a validated `/connections` entry.
- Invoices, bills, credit notes, quotes and purchase orders still default to DRAFT.
- VOIDED and DELETED still need `confirm: true`; `delete_payment` still needs the literal `true`.
- Idempotency keys are still sent on every create.
- Read only stays the default on the consent page and contains no write scope.
- Each client is limited to its own consent: a shared token with more scopes never widens it, and every call re-checks.
- The fork's outright block on VOIDED and DELETED invoice statuses is untouched.
- No settings write scope is requested at all, because no tool writes settings.
