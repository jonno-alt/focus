# Brief for ChatGPT on the Turkey PC: finish the Xero Direct repair

Written 30 September 2026 for Jonno White (Consult Clarity). Australian English. Same worker, same endpoint, no new server. Work Receipt `recXcKpt08kl2FXgH`, key `xero-mcp-scope-fix-2026-09-30`.

Total time: about 2 hours of ChatGPT work plus about 25 minutes of Jonno's clicks, spread over five gates.

## 0. What this is and why

Jonno runs a remote MCP server for Xero on Cloudflare Workers. It is a customised fork of `derekclair/xero-mcp`. Claude and ChatGPT both use it through OAuth.

- Worker name: `xero-mcp`
- Endpoint: `https://jonno-xero-mcp.xero-mcp.workers.dev/mcp`
- Deployed 28 September 2026, version `0bcbbdad-4825-440b-b57b-5894b545fa36`
- Original source folder on the Mac: `/Users/administrator/Documents/AI-Integrations/xero-mcp-derek`. It is iCloud-offloaded and mostly unreadable. Do not depend on it.

Problem: the live server exposes only 17 of the 55 tools the code implements, and the Xero grant it holds is only `accounting.contacts.read`, `accounting.invoices`, `accounting.settings.read`. So `create_contact`, payments, banking, reports, attachments, bills, credit notes, quotes and purchase orders are all missing. Two causes inside the fork: a 17-tool allowlist, and a narrowed `XERO_SCOPES_OVERRIDE` set as a plain variable in `wrangler.jsonc`.

Goal: after Jonno explicitly authorises "Read + write" at Xero, all 55 tools appear in both Claude and ChatGPT, and every existing protection stays.

## 1. What already exists (do not redo this)

Claude Code prepared and tested the fix against upstream `derekclair/xero-mcp` main (base commit `1bea37ab0b8fc67d06d0c7817235c8db086e49cd`). Two commits, 35 tests, type-check and `wrangler deploy --dry-run` all pass. Codex on the Mac independently re-ran the first 21 tests.

Files, all public, in GitHub `jonno-alt/focus`, branch `claude/compassionate-curie-376h9c`, folder `xero-mcp-scope-fix/`:

| File | Purpose |
|---|---|
| `0001-Derive-consent-presets-...patch` | Consent presets derived from the tool map, so Read + write requests exactly the 12 accounting scopes the 55 tools need, and nothing unused. |
| `0002-Gate-tools-by-client-grant-...patch` | Each MCP client is limited to its own consent even though the fork shares Xero tokens between clients; every tool call re-checks and fails closed. |
| `full-scope-fix.diff` | Both commits as one diff. |
| `new-files/` | Six ready-to-copy files: `scopes.ts`, `scopes.test.ts`, `effective-scopes.ts`, `effective-scopes.test.ts`, `register-tools.ts`, `register-tools.test.ts`. |
| `FORK-ADAPTATION.md` | File-by-file port guide for the fork. Read it fully. |
| `TOOL-AUDIT.md` | All 55 tools with endpoint, scope and current visibility. |
| `README-JONNO.md` | Jonno's click path. |

Raw download pattern: `https://raw.githubusercontent.com/jonno-alt/focus/claude/compassionate-curie-376h9c/xero-mcp-scope-fix/<path>`.

Copies of the notes are also in E2 bucket `cgg-ai-files-2026` under `chat-outputs/xero-mcp-scope-fix-2026-09-30/`.

## 2. Hard rules for this job

1. Never ask Jonno to paste a token, key, password, client secret or refresh token into chat. He types credentials into the terminal or a settings screen himself.
2. Do not create a second worker, a second Xero app or a second connector. Same worker name `xero-mcp`, same endpoint.
3. Do not delete any Cloudflare secret. `XERO_SCOPES_OVERRIDE` is a plain variable in `wrangler.jsonc`, not a secret. Confirm with `npx wrangler secret list` before touching anything named like it.
4. Preserve, exactly as deployed: the shared-KV login fix in `src/index.ts` (Xero tokens kept per Xero user in the `OAUTH_KV` namespace so refresh tokens survive across sessions), the fork's outright block on `VOIDED` and `DELETED` invoice statuses, DRAFT defaults on invoices, bills, credit notes, quotes and purchase orders, `confirm: true` gates, idempotency keys on creates, tenant validation against `/connections`, and the rule that tokens never appear in tool output or logs.
5. Do not deploy until Jonno has seen the test results and said yes. Do not write anything to Xero to prove access. Reads only.
6. Do not use the folder under `.../recovery-20260929/frozen-differences/...` (no `src` tree) or the 27 September E2 zip `archive/connector-repair-2026-09-27/xero-repair-2026-09-27.zip` (a different token coordinator) as the build source.
7. File every step: save outputs to E2 under `chat-outputs/xero-mcp-scope-fix-2026-09-30/turkey-<step>/...` with new keys, read each back, and append to Work Receipt `recXcKpt08kl2FXgH` in field `fldORi4zaeI5VD0HX`. Same key, never a new record. If a save fails, say NOT SAVED.

## 3. Phase A. Cloudflare sign-in on the Turkey PC (Jonno, about 5 min)

Work in a folder outside any synced drive, for example `C:\work\xero-mcp`. Node 22 and npm are needed. Install nothing globally; use `npx wrangler` inside the project once it exists.

Two ways to authenticate; use whichever Jonno prefers:

- **Browser login.** In a terminal on the Turkey PC run `npx wrangler login`. A browser opens on that PC; Jonno approves. Check with `npx wrangler whoami`, which prints the account name and account id.
- **API token.** Jonno creates it in the Cloudflare dashboard: profile menu, API Tokens, Create Token, template "Edit Cloudflare Workers", scope it to his account, Continue, Create. He sets it in the PowerShell session himself (`$env:CLOUDFLARE_API_TOKEN = "..."` and `$env:CLOUDFLARE_ACCOUNT_ID = "..."`) and never pastes it into chat. Check with `npx wrangler whoami`.

Record the account id in the receipt. Do not record the token anywhere.

## 4. Phase B. Pull the exact deployed code (ChatGPT, about 15 min)

The Mac source is unreadable, so the deployed bundle is the source of truth for what the fork does.

1. List versions and confirm the active one:
   ```
   npx wrangler versions list --name xero-mcp
   ```
   Expect `0bcbbdad-4825-440b-b57b-5894b545fa36` as the active deployment. If a different version is active, stop and report it; someone deployed since 28 September.

2. Download the deployed script and its settings with the API (curl or PowerShell `Invoke-WebRequest`; the token comes from the environment variable, never typed into the chat):
   ```
   GET https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/xero-mcp/content/v2
   GET https://api.cloudflare.com/client/v4/accounts/{account_id}/workers/scripts/xero-mcp/settings
   ```
   The first returns the ESM module (a multipart response; save the JavaScript part as `deployed/index.js`). The second returns JSON with bindings: expect a Durable Object binding `MCP_OBJECT` for class `XeroMCP`, a KV binding `OAUTH_KV` with its namespace id, plain-text vars (`MCP_SERVER_NAME`, `XERO_AUTH_MODE`, `XERO_SCOPES_OVERRIDE`) and secret bindings by name only (`XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `COOKIE_ENCRYPTION_KEY`). Save as `deployed/settings.json`. Save both to E2 as text and read them back.

3. Read `deployed/index.js`. It is an esbuild bundle. Each original module starts with a comment such as `// src/index.ts` or `// src/auth/scopes.ts`; library code (hono, agents, workers-oauth-provider, zod) sits in other sections. Extract only the `// src/...` sections. From them, write down, with line references:
   - the 17-tool allowlist and where it is applied;
   - how `XERO_SCOPES_OVERRIDE` is read and used;
   - the shared-KV token store: the KV key pattern, what is stored (access token, refresh token, expiry, scopes, active tenant), when it is written (callback, refresh) and when it is read (session init, retry after a consumed refresh token), and any refresh lock;
   - the invoice status block for `VOIDED` and `DELETED`;
   - every other difference from upstream `1bea37a` (compare against the upstream files, which you can fetch raw from `https://raw.githubusercontent.com/derekclair/xero-mcp/1bea37ab0b8fc67d06d0c7817235c8db086e49cd/src/...`).
   Save this as `turkey-b/fork-differences.md` in E2 and in the receipt. This document is the contract for the port.

## 5. Phase C. Rebuild a TypeScript fork that matches the bundle, then port the fix (ChatGPT, about 60 min)

Because the bundle is JavaScript with types stripped, rebuild the fork in TypeScript rather than deploying the bundle by hand:

1. `git clone https://github.com/derekclair/xero-mcp C:\work\xero-mcp` and `git checkout 1bea37ab0b8fc67d06d0c7817235c8db086e49cd`.
2. Apply Claude's two patches: `git am 0001-*.patch 0002-*.patch` (download them from the raw URLs above). They apply cleanly to this base.
3. Re-apply the fork's customisations from `fork-differences.md` on top:
   - the shared-KV token store and its wiring in `src/index.ts` and `src/auth/xero-handler.ts`, matching the deployed logic line for line in behaviour;
   - the `VOIDED`/`DELETED` block in `src/mcp/tools/invoices.ts` (and its tests if the bundle shows any test-visible behaviour);
   - any other deployed differences you listed.
   Do NOT re-apply the 17-tool allowlist and do NOT add `XERO_SCOPES_OVERRIDE` to `vars`. Those two are the fix.
4. Wire the new scope sources in `src/index.ts` exactly as `FORK-ADAPTATION.md` says: `getProps()` returns `scopes: props.scopes` (this client's own consent), and `registerAllTools(server, getClient, getProps, setActiveTenant, { clientGrant: () => props.scopes, upstream: () => <scopes field of the shared KV token record as currently loaded> })`. Make sure the callback and the refresh path both write the token response's `scope` string into the shared KV record.
5. `wrangler.jsonc`: take the deployed settings as the reference. Keep `name: "xero-mcp"`, the same `compatibility_date` and flags, the same Durable Object binding and migration tag `v1` for class `XeroMCP`, and the same `OAUTH_KV` namespace id from `settings.json`. Keep `vars` to `MCP_SERVER_NAME` and `XERO_AUTH_MODE` only. If the deployed settings show `upload_source_maps` or observability, keep them.
6. Optional but useful: version `0.2.0` in `package.json` and in the `McpServer` constructor so the MCP handshake shows the new build.

## 6. Phase D. Test (ChatGPT, about 10 min)

```
npm ci --legacy-peer-deps
npm run type-check
npm test
npx wrangler deploy --dry-run --outdir dist
```

Pass criteria, all required:

- type-check clean;
- 35 Claude tests pass: preset invariants, all 55 tools register under Read + write, the read preset registers no write tool, unknown tool denied, read-only client not widened by a read+write shared token, read+write client narrowed by a read-only shared token, a write tool fails closed with `insufficient_scope` after narrowing and never calls Xero, a read tool still works after narrowing;
- any fork tests you recreated pass, including the `VOIDED`/`DELETED` block;
- the dry run bundles and lists the same bindings as `settings.json` (DO `MCP_OBJECT`, KV `OAUTH_KV` with the same id, the two vars);
- `git diff` of `dist/index.js` against `deployed/index.js`, restricted to the `// src/` sections, shows only the intended changes: allowlist gone, override var gone, new scope derivation, new effective-scope gate, diagnostics in `list_granted_scopes`, consent page scope list. Anything else in that diff is a porting mistake; fix it before going on.

Save the test output, the dry-run output and the restricted diff to E2 under `turkey-d/`, read back, append to the receipt.

## 7. Gate 1. Jonno approves the deployment (Jonno, about 5 min)

Show Jonno, in plain words: test counts, the restricted diff summary, the bindings list, and the rollback command below. Wait for an explicit yes. Do not deploy on silence.

## 8. Phase E. Xero app scopes (Jonno, about 5 min)

Before deploying, Jonno opens https://developer.xero.com/app/manage, opens the app whose client id the worker uses, opens Configuration, and ticks exactly these accounting scopes, then saves:

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

Plus `openid`, `profile`, `email`, `offline_access`. Nothing else. If any of the 12 is not enabled on the app, Xero rejects the whole consent with `invalid_scope`.

## 9. Phase F. Deploy (ChatGPT, about 3 min, only after Gate 1)

```
npx wrangler deploy
```

Record the new version id. Secrets are untouched by a deploy. If anything goes wrong at any later step, roll back with:

```
npx wrangler rollback --name xero-mcp
```

or `npx wrangler versions deploy` choosing `0bcbbdad-4825-440b-b57b-5894b545fa36` at 100 percent. Save the deploy output to E2 under `turkey-f/`, append to the receipt with the new version id.

Optional live watch during the next phase, useful and safe as long as nobody pastes its output into chat unredacted:

```
npx wrangler tail xero-mcp --format pretty
```

## 10. Gate 2. Reconnect the clients (Jonno, about 5 min each)

A scope change never widens an existing grant; each client must reconnect.

Claude: https://claude.ai/settings/connectors, Xero Direct, Disconnect (do not delete), then Connect. On the xero-mcp consent page choose **Read + write** (expand "Exact Xero scopes requested" and check it lists the 12 scopes), Continue to Xero, choose Consult Clarity, Allow access.

ChatGPT: Settings, Connectors (Developer mode on), Xero Direct, Disconnect, then Connect, same consent.

Whichever client connects second replaces the shared Xero tokens; the first client keeps only what its own consent allows. That is by design and is what the isolation tests cover.

## 11. Phase G. Verify (ChatGPT in its own client, Jonno or Claude in the Claude client, about 10 min)

In each client run `list_granted_scopes`. Expected:

- `scopes`: the 12 accounting scopes plus the four identity scopes;
- `client_grant_scopes` equals `upstream_token_scopes`;
- `withheld_from_this_client` is empty;
- `available_tools` has 55 entries, `unavailable_tools` is empty.

Then `xero_whoami`, `list_organisations`, `list_contacts`, `list_invoices`. Confirm write tools such as `create_contact`, `create_payment`, `create_bank_transaction` and `upload_attachment` are present in the tool list. Do not call any of them. Presence in the catalogue is the proof.

If a client shows fewer tools: check `withheld_from_this_client` (it names the scopes the shared token has that this client did not approve, meaning this client needs to reconnect and choose Read + write) and `unavailable_tools` (names the scope each hidden tool needs).

Save the two clients' `list_granted_scopes` outputs to E2 under `turkey-g/`, read back, and append the final entry to the receipt: version id, both clients verified, tool count, and that no Xero data was written. Set the receipt work state to Complete only when both clients show 55 tools.

## 12. If something is missing on the Turkey PC

- No Node: install Node 22 LTS from nodejs.org (Jonno approves installs).
- `npm ci` fails on peer dependencies: use `npm ci --legacy-peer-deps`; the lockfile was made that way.
- `wrangler versions list` says the worker is not found: the login is on the wrong Cloudflare account; check `npx wrangler whoami`.
- The bundle has no `// src/` comments: it was minified or built with a different bundler. Then reconstruct the fork's behaviour from the receipts (`recIwoNkp4RNI2ZsP`, `rectmQDRMuidTdw0T`, `recyAp7Fy58cx3yx2`) and from the function names still visible, and say plainly that the port is behavioural rather than line-exact.
- Anything that needs a credential, a purchase or a change to account security: stop and hand it to Jonno with the exact clicks.
