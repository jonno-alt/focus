import { describe, expect, it } from "vitest";
import { effectiveScopes, scopesWithheldFromClient } from "./effective-scopes";
import { parseGrantedScopes, scopesForPreset, isWriteScope } from "./scopes";

const READ = parseGrantedScopes(scopesForPreset("read").join(" "));
const RW = parseGrantedScopes(scopesForPreset("readwrite").join(" "));

describe("effectiveScopes (client grant ∩ upstream tokens)", () => {
	it("read-only client never gains write from a wider shared token", () => {
		const eff = effectiveScopes(READ, RW);
		expect([...eff].filter(isWriteScope)).toEqual([]);
		expect(eff.has("accounting.contacts.read")).toBe(true);
		expect(eff.has("accounting.contacts")).toBe(false);
		expect(eff.has("accounting.reports.profitandloss.read")).toBe(true);
		expect(eff.has("offline_access")).toBe(true);
	});

	it("read+write client is narrowed to read when the shared token is read-only", () => {
		const eff = effectiveScopes(RW, READ);
		expect([...eff].filter(isWriteScope)).toEqual([]);
		expect(eff.has("accounting.invoices.read")).toBe(true);
		expect(eff.has("accounting.invoices")).toBe(false);
	});

	it("both read+write keeps every scope", () => {
		const eff = effectiveScopes(RW, RW);
		expect([...eff].sort()).toEqual([...RW].sort());
	});

	it("the pre-fix live grant on both sides is unchanged", () => {
		const live = parseGrantedScopes(
			"openid profile email offline_access accounting.contacts.read accounting.invoices accounting.settings.read",
		);
		expect([...effectiveScopes(live, live)].sort()).toEqual([...live].sort());
	});

	it("a scope the client never approved is withheld even if upstream has it", () => {
		const client = parseGrantedScopes("openid offline_access accounting.contacts.read");
		const upstream = parseGrantedScopes("openid offline_access accounting.contacts accounting.payments");
		const eff = effectiveScopes(client, upstream);
		expect([...eff].sort()).toEqual(["accounting.contacts.read", "offline_access", "openid"]);
		expect(scopesWithheldFromClient(client, upstream)).toEqual([
			"accounting.contacts",
			"accounting.payments",
		]);
	});

	it("a scope the client approved but upstream lost is dropped", () => {
		const client = parseGrantedScopes("accounting.payments accounting.invoices");
		const upstream = parseGrantedScopes("accounting.invoices");
		expect([...effectiveScopes(client, upstream)]).toEqual(["accounting.invoices"]);
	});
});
