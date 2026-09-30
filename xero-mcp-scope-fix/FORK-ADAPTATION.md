# Adapting the fix to the deployed Mac fork

Target: `/Users/administrator/Documents/AI-Integrations/xero-mcp-derek`, deployed 28 September as version `0bcbbdad-4825-440b-b57b-5894b545fa36` at `https://jonno-xero-mcp.xero-mcp.workers.dev/mcp`. Same worker, same endpoint. No new server.

The upstream patch does not apply cleanly to that fork, so port it file by file. Everything below preserves the fork's shared-KV login fix, its 17-tool allowlist is the only thing removed, and its outright block on VOIDED and DELETED invoice statuses stays.

## A. Get a complete, verified source tree first (human, about 15 min)

Codex found only 2 or 3 of the fork's source files resident; the rest are iCloud placeholders and the data volume is 98 percent full. Any one of these gives a build you can trust:

1. **Free space, then download.** iCloud will not materialise files onto a nearly full disk. Empty Trash, clear `~/Library/Caches`, or move a large folder off the data volume until at least 10 GiB is free. Then in Finder right-click `xero-mcp-derek`, choose **Download Now**, and wait for the cloud icon to disappear on every file. Verify in Terminal:

   ```bash
   cd /Users/administrator/Documents/AI-Integrations/xero-mcp-derek
   find src wrangler.jsonc package.json package-lock.json -type f | wc -l
   find src -type f -size 0 | wc -l      # must print 0
   ```

2. **Copy out of iCloud.** In Finder, copy the whole folder to a non-iCloud path such as `/Users/administrator/Local/xero-mcp-derek`. A Finder copy forces the download. Build from the copy. Run the same two checks there.

3. **Exact deployed bundle from Cloudflare** (definitive record of what is live, useful even if 1 and 2 succeed). Signed in to wrangler on the Mac:

   ```bash
   npx wrangler whoami                      # shows the account id
   npx wrangler versions list --name xero-mcp
   ```

   Then download the active version's script with the Cloudflare API using an API token you create yourself (Workers Scripts: Read). Do not paste the token into any chat.

   ```bash
   curl -sS -H "Authorization: Bearer $CF_API_TOKEN" \
     "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/xero-mcp/content/v2" \
     -o deployed-xero-mcp.bundle
   ```

   This is the esbuild bundle, not TypeScript, but it can be diffed against `npx wrangler deploy --dry-run --outdir dist` from the candidate to prove only the intended behaviour changed.

Do not build from `.../recovery-20260929/frozen-differences/main/Documents/AI-Integrations/xero-mcp-derek` (no `src` tree) or from the 27 September E2 zip (different token coordinator).

## B. Port the change (about 20 min)

Work in the non-iCloud copy. Files in `new-files/` are the upstream versions to copy or merge.

| Fork file | Action |
|---|---|
| `src/auth/scopes.ts` | Replace the preset functions and add the derived constants and helpers from `new-files/scopes.ts`. Keep the fork's `TOOL_SCOPE_MAP` only if it still has all 55 entries; if the fork trimmed the map to 17, take the upstream map. |
| the 17-tool allowlist (wherever the fork lists `xero_whoami`, `create_invoice`, `email_invoice`, `list_currencies` together) | Delete it, or set it to `Object.keys(TOOL_SCOPE_MAP)`. The scope gate is already deny by default. |
| `wrangler.jsonc` | Remove the `XERO_SCOPES_OVERRIDE` entry from `vars` in the candidate only. It is a plain variable, not a secret; do not run `wrangler secret delete`. Run `npx wrangler secret list` once to confirm no secret of that name exists either. |
| `src/auth/effective-scopes.ts` and `.test.ts` | Copy verbatim. |
| `src/mcp/register-tools.ts` | Take the upstream version, then re-add any fork-specific registrar calls. It accepts a fifth argument `{ clientGrant, upstream }`. |
| `src/mcp/register-tools.test.ts`, `src/auth/scopes.test.ts` | Copy verbatim. Keep the fork's own invoice-status tests untouched. |
| `src/mcp/tools/org.ts` | Port only the `list_granted_scopes` and `xero_whoami` changes (a fifth `sources` argument, `client_grant_scopes`, `upstream_token_scopes`, `withheld_from_this_client`, `available_tools`, `unavailable_tools`). |
| `src/auth/xero-handler.ts` | Port the consent page changes: exact scope list under each option and the override notice. In `/callback`, make sure the new tokens **and their `scope` string** overwrite the shared KV record for this Xero user. |
| `src/index.ts` (holds the shared-KV login fix) | Do not replace. Two edits only: `getProps()` returns `scopes: props.scopes` (this client's own consent); and call `registerAllTools(server, getClient, getProps, setActiveTenant, { clientGrant: () => props.scopes, upstream: () => <scopes of the shared KV token record as currently loaded> })`. On token refresh, store the refresh response's `scope` into that record. |
| `src/mcp/tools/invoices.ts` | Leave alone. The fork's outright VOIDED/DELETED block stays. |
| `src/mcp/tools/reports.ts` | Optional: the two description tweaks noting Xero requires `contact_id`. |
| `package.json`, `src/index.ts` version | Optional: `0.2.0`, so the MCP handshake shows the new build. |

Why the split of `clientGrant` and `upstream` matters: in the shared token store, ChatGPT's login replaces the Xero tokens Claude uses and vice versa. Gating on the intersection means a client can be narrowed by the shared token but never widened past what its own user approved, and every tool call re-checks so a later narrowing fails closed with `insufficient_scope` instead of reaching Xero.

## C. Test (about 5 min)

```bash
npm ci --legacy-peer-deps
npm run type-check
npm test
npx wrangler deploy --dry-run --outdir dist
```

Expected: the fork's existing tests still pass (including its VOIDED/DELETED block tests), plus 35 new tests: preset invariants, all 55 tools under Read + write, read preset excludes every write tool, unknown tool denied, read-only client not widened by a read+write shared token, read+write client narrowed by a read-only shared token, write tool fails closed after narrowing without calling Xero, read tool still works after narrowing.

## D. Deploy and reconnect (Jonno, about 15 min)

1. Tick the 12 accounting scopes on the Xero app at https://developer.xero.com/app/manage (list in README-JONNO.md).
2. `npm run deploy` from the candidate. Note the new version id.
3. Claude: https://claude.ai/settings/connectors, Xero Direct, **Disconnect**, then **Connect**. Choose **Read + write**, then **Allow access** at Xero for Consult Clarity.
4. ChatGPT: Settings, Connectors, Xero Direct, **Disconnect**, then **Connect**, same consent.
5. In each client run `list_granted_scopes`. Expect 12 accounting scopes, `client_grant_scopes` equal to `upstream_token_scopes`, `withheld_from_this_client` empty, 55 `available_tools`, `unavailable_tools` empty. Then `xero_whoami`, `list_organisations`, `list_contacts`, `list_invoices`. No write is needed to prove the catalogue.
