/**
 * Effective scopes for one MCP client session.
 *
 * Two scope sets exist per session:
 *   - clientGrant: what THIS MCP client's user approved at consent (its own /callback).
 *     Immutable for the life of the MCP token.
 *   - upstream:    what the Xero tokens the session actually uses carry right now. In a
 *     deployment with a shared per-user token store, another client's newer consent can
 *     replace these tokens with a wider or narrower scope set at any time.
 *
 * A tool may be used only when BOTH sets allow it. This function returns the
 * intersection, expressed at the narrowest level that both sides cover:
 *   client has write, upstream has read  → read
 *   client has read,  upstream has write → read
 *   both write                           → write
 * Identity scopes (openid, profile, email, offline_access) pass through from the client
 * grant; they gate no tools.
 */

import { IDENTITY_SCOPES, isWriteScope } from "./scopes";

const IDENTITY = new Set<string>(IDENTITY_SCOPES);

export function effectiveScopes(clientGrant: Set<string>, upstream: Set<string>): Set<string> {
	const out = new Set<string>();
	for (const c of clientGrant) {
		if (IDENTITY.has(c)) {
			out.add(c);
			continue;
		}
		if (upstream.has(c)) {
			out.add(c);
			continue;
		}
		if (isWriteScope(c) && upstream.has(`${c}.read`)) {
			out.add(`${c}.read`);
			continue;
		}
		if (c.endsWith(".read") && upstream.has(c.replace(/\.read$/, ""))) {
			out.add(c);
		}
	}
	return out;
}

/** Scopes present in `upstream` but not usable by this client (for diagnostics only). */
export function scopesWithheldFromClient(clientGrant: Set<string>, upstream: Set<string>): string[] {
	const eff = effectiveScopes(clientGrant, upstream);
	return [...upstream].filter((s) => !IDENTITY.has(s) && !eff.has(s)).sort();
}
