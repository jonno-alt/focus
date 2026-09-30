import { describe, expect, it } from "vitest";
import {
	ALL_TOOL_SCOPES,
	canRegisterTool,
	hasScope,
	IDENTITY_SCOPES,
	isReadTool,
	isWriteScope,
	parseGrantedScopes,
	READ_SCOPES,
	READWRITE_SCOPES,
	REPORT_SCOPES,
	scopeBullets,
	scopesForPreset,
	scopeString,
	TOOL_SCOPE_MAP,
	toolAvailability,
	WRITE_SCOPES,
} from "./scopes";

const ALL_TOOLS = Object.keys(TOOL_SCOPE_MAP);
const WRITE_TOOLS = ALL_TOOLS.filter((t) => !isReadTool(t));
const READ_TOOLS = ALL_TOOLS.filter((t) => isReadTool(t));

describe("scope presets", () => {
	it("read preset is least-privilege (no write scopes)", () => {
		const scopes = scopesForPreset("read");
		expect(scopes).toContain("accounting.invoices.read");
		expect(scopes).toContain("offline_access");
		expect(scopes.filter(isWriteScope)).toEqual([]);
	});

	it("readwrite preset requests every write scope any tool needs", () => {
		const scopes = scopesForPreset("readwrite");
		for (const s of [
			"accounting.contacts",
			"accounting.invoices",
			"accounting.payments",
			"accounting.banktransactions",
			"accounting.attachments",
		]) {
			expect(scopes, `missing ${s}`).toContain(s);
		}
		expect(scopes).toContain("accounting.reports.profitandloss.read");
		expect(scopes).toContain("accounting.settings.read");
	});

	it("readwrite preset does not request write scopes no tool uses", () => {
		// Settings tools are all reads: never ask for accounting.settings (write).
		expect(READWRITE_SCOPES).not.toContain("accounting.settings");
		for (const s of READWRITE_SCOPES) {
			expect(ALL_TOOL_SCOPES, `${s} is requested but no tool needs it`).toContain(s);
		}
	});

	it("presets contain no scope that no implemented tool needs", () => {
		// e.g. accounting.reports.taxreports.read has no tool, so it must not be requested
		const used = new Set(ALL_TOOL_SCOPES.map((s) => s.replace(/\.read$/, "")));
		for (const preset of ["read", "readwrite"] as const) {
			for (const s of scopesForPreset(preset)) {
				if ((IDENTITY_SCOPES as readonly string[]).includes(s)) continue;
				expect(used, `${preset} preset requests unused scope ${s}`).toContain(
					s.replace(/\.read$/, ""),
				);
			}
		}
		expect(scopesForPreset("readwrite")).not.toContain("accounting.reports.taxreports.read");
	});

	it("readwrite omits .read scopes whose write parent is requested", () => {
		for (const w of WRITE_SCOPES) {
			expect(READWRITE_SCOPES).not.toContain(`${w}.read`);
		}
	});

	it("report scopes are read-only and all present in both presets", () => {
		expect(REPORT_SCOPES.length).toBeGreaterThan(0);
		for (const r of REPORT_SCOPES) {
			expect(r.endsWith(".read")).toBe(true);
			expect(scopesForPreset("read")).toContain(r);
			expect(scopesForPreset("readwrite")).toContain(r);
		}
	});

	it("scopeString honours override verbatim and falls back to preset", () => {
		expect(scopeString("readwrite", "  openid   accounting.invoices ")).toBe(
			"openid accounting.invoices",
		);
		expect(scopeString("read")).toBe(scopesForPreset("read").join(" "));
	});

	it("consent bullets exist for both presets", () => {
		expect(scopeBullets("read").length).toBeGreaterThan(3);
		expect(scopeBullets("readwrite").length).toBeGreaterThan(3);
	});
});

describe("scope gating", () => {
	it("write scope satisfies .read requirement", () => {
		const granted = parseGrantedScopes("accounting.invoices offline_access");
		expect(hasScope(granted, "accounting.invoices.read")).toBe(true);
		expect(hasScope(granted, "accounting.invoices")).toBe(true);
		expect(hasScope(granted, "accounting.payments")).toBe(false);
	});

	it("read scope never satisfies a write requirement", () => {
		const granted = parseGrantedScopes("accounting.contacts.read");
		expect(hasScope(granted, "accounting.contacts")).toBe(false);
		expect(canRegisterTool("create_contact", granted)).toBe(false);
		expect(canRegisterTool("list_contacts", granted)).toBe(true);
	});

	it("unknown tool names never register", () => {
		expect(canRegisterTool("not_a_tool", parseGrantedScopes(scopesForPreset("readwrite").join(" ")))).toBe(false);
	});

	it("read preset exposes exactly the read tools", () => {
		const readOnly = parseGrantedScopes(scopesForPreset("read").join(" "));
		for (const t of READ_TOOLS) expect(canRegisterTool(t, readOnly), t).toBe(true);
		for (const t of WRITE_TOOLS) expect(canRegisterTool(t, readOnly), t).toBe(false);
		expect(WRITE_TOOLS).toContain("create_contact");
		expect(WRITE_TOOLS).toContain("create_invoice");
		expect(READ_TOOLS).toContain("get_profit_and_loss");
		expect(READ_TOOLS).toContain("xero_whoami");
	});

	it("readwrite preset exposes EVERY tool in the catalog", () => {
		const rw = parseGrantedScopes(scopesForPreset("readwrite").join(" "));
		const { available, unavailable } = toolAvailability(rw);
		expect(unavailable).toEqual([]);
		expect(available.sort()).toEqual([...ALL_TOOLS].sort());
	});

	it("create_contact becomes available exactly when accounting.contacts is granted", () => {
		expect(canRegisterTool("create_contact", parseGrantedScopes("accounting.contacts"))).toBe(true);
		expect(canRegisterTool("update_contact", parseGrantedScopes("accounting.contacts"))).toBe(true);
		expect(canRegisterTool("create_contact", parseGrantedScopes("accounting.contacts.read accounting.invoices"))).toBe(false);
	});

	it("explains hidden tools for a narrow grant (the pre-fix live grant)", () => {
		const narrow = parseGrantedScopes(
			"openid profile email offline_access accounting.contacts.read accounting.invoices accounting.settings.read",
		);
		const { available, unavailable } = toolAvailability(narrow);
		expect(available).toContain("create_invoice");
		expect(available).toContain("list_bills");
		expect(available).not.toContain("create_contact");
		const hidden = unavailable.find((u) => u.tool === "create_contact");
		expect(hidden?.requires_any_of).toEqual(["accounting.contacts"]);
		expect(unavailable.map((u) => u.tool)).toContain("list_payments");
		expect(unavailable.map((u) => u.tool)).toContain("get_profit_and_loss");
	});
});
