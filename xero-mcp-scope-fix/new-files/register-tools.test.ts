import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";
import type { Props } from "../auth/props";
import { isReadTool, scopesForPreset, TOOL_SCOPE_MAP } from "../auth/scopes";
import type { XeroClient } from "../xero/client";
import { registerAllTools } from "./register-tools";

/**
 * Registration tests: run the REAL tool registrars against a fake McpServer that
 * records every tool name, so "implemented but never registered" cannot slip through.
 */

type ToolCb = (args: unknown, extra: unknown) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function fakeServer() {
	const names: string[] = [];
	const callbacks = new Map<string, ToolCb>();
	const server = {
		tool(name: string, ...rest: unknown[]) {
			names.push(name);
			callbacks.set(name, rest[rest.length - 1] as ToolCb);
			return server;
		},
	};
	return { server: server as unknown as McpServer, names, callbacks };
}

/** Minimal client: tenant already active, every request returns an empty list. */
function stubClient(calls: string[]) {
	return {
		getActiveTenantId: () => "11111111-1111-4111-8111-111111111111",
		setActiveTenantId() {},
		async assertTenantAllowed() {
			return { tenantId: "t", tenantName: "T", tenantType: "ORGANISATION", id: "c" };
		},
		async listConnections() {
			return [];
		},
		async request(method: string, path: string) {
			calls.push(`${method} ${path}`);
			return { Contacts: [] };
		},
	} as unknown as XeroClient;
}

function propsWithScopes(scopes: string): Props {
	return {
		login: "u",
		name: "User",
		email: "u@example.com",
		accessToken: "redacted",
		refreshToken: "redacted",
		expiresAt: Date.now() + 60_000,
		scopes,
		connections: [],
		activeTenantId: null,
		scopePreset: "read",
	};
}

function register(scopes: string) {
	const { server, names } = fakeServer();
	const result = registerAllTools(
		server,
		() => ({}) as unknown as XeroClient,
		() => propsWithScopes(scopes),
		async () => {},
	);
	return { names, result };
}

const CATALOG = Object.keys(TOOL_SCOPE_MAP).sort();
const RW = scopesForPreset("readwrite").join(" ");
const RO = scopesForPreset("read").join(" ");

function registerWithSources(clientGrant: string, upstream: () => string, calls: string[] = []) {
	const { server, names, callbacks } = fakeServer();
	const result = registerAllTools(
		server,
		() => stubClient(calls),
		() => propsWithScopes(clientGrant),
		async () => {},
		{ clientGrant: () => clientGrant, upstream },
	);
	return { names, callbacks, result, calls };
}

describe("registerAllTools", () => {
	it("every implemented tool has a scope entry, and every scope entry has an implementation", () => {
		const { result } = register(scopesForPreset("readwrite").join(" "));
		expect(result.unmapped).toEqual([]);
		const implemented = [...result.registered, ...result.skipped].sort();
		expect(implemented).toEqual(CATALOG);
	});

	it("readwrite grant registers every implemented tool, including create_contact", () => {
		const { names, result } = register(scopesForPreset("readwrite").join(" "));
		expect(result.skipped).toEqual([]);
		expect(names.sort()).toEqual(CATALOG);
		for (const t of [
			"list_contacts",
			"get_contact",
			"create_contact",
			"update_contact",
			"list_invoices",
			"get_invoice",
			"create_invoice",
			"update_invoice",
			"email_invoice",
			"list_bills",
			"create_bill",
			"update_bill",
			"list_credit_notes",
			"create_credit_note",
			"allocate_credit_note",
			"list_quotes",
			"create_quote",
			"list_purchase_orders",
			"create_purchase_order",
			"list_payments",
			"create_payment",
			"delete_payment",
			"create_batch_payment",
			"allocate_overpayment",
			"allocate_prepayment",
			"list_bank_transactions",
			"create_bank_transaction",
			"update_bank_transaction",
			"list_bank_transfers",
			"create_bank_transfer",
			"list_accounts",
			"list_tax_rates",
			"get_organisation",
			"get_profit_and_loss",
			"get_balance_sheet",
			"get_trial_balance",
			"get_executive_summary",
			"get_bank_summary",
			"get_aged_receivables",
			"get_aged_payables",
			"list_attachments",
			"upload_attachment",
		]) {
			expect(names, `${t} should be registered`).toContain(t);
		}
	});

	it("read grant registers only read tools and never a write tool", () => {
		const { names } = register(scopesForPreset("read").join(" "));
		const expected = CATALOG.filter(isReadTool);
		expect(names.sort()).toEqual(expected);
		for (const t of names) expect(isReadTool(t), `${t} is a write tool`).toBe(true);
		expect(names).not.toContain("create_contact");
		expect(names).not.toContain("create_invoice");
		expect(names).not.toContain("delete_payment");
	});

	it("no scopes at all still registers the session tools only", () => {
		const { names } = register("openid profile email offline_access");
		expect(names.sort()).toEqual(
			["xero_whoami", "list_organisations", "set_active_organisation", "list_granted_scopes"].sort(),
		);
	});

	it("reproduces the narrow pre-fix live grant: 17 tools, no create_contact", () => {
		const { names, result } = register(
			"openid profile email accounting.contacts.read accounting.invoices accounting.settings.read offline_access",
		);
		expect(names).not.toContain("create_contact");
		expect(names).toContain("create_invoice");
		expect(names).toContain("list_bills");
		expect(names).toContain("create_credit_note");
		expect(result.skipped).toContain("create_contact");
		expect(result.skipped).toContain("list_payments");
	});

	it("removes the scope gate from server.tool after registration", () => {
		const { server, names } = fakeServer();
		registerAllTools(
			server,
			() => ({}) as unknown as XeroClient,
			() => propsWithScopes(""),
			async () => {},
		);
		// After registration the gate must be gone: an unmapped name reaches the real method.
		server.tool("later_registered_tool", "desc", {}, async () => ({ content: [] }));
		expect(names).toContain("later_registered_tool");
	});

	describe("client permission isolation with a shared upstream token", () => {
		it("a read-only client gets no write tools even when the shared token is read+write", () => {
			const { names, result } = registerWithSources(RO, () => RW);
			expect(names.sort()).toEqual(CATALOG.filter(isReadTool));
			expect(result.skipped).toContain("create_contact");
			expect(result.skipped).toContain("create_invoice");
		});

		it("a read+write client is narrowed to read tools when the shared token is read-only", () => {
			const { names } = registerWithSources(RW, () => RO);
			expect(names).not.toContain("create_contact");
			expect(names).toContain("list_contacts");
		});

		it("a client sees only what it approved even if another client approved more", () => {
			const narrowClient = "openid offline_access accounting.contacts.read accounting.invoices";
			const { names } = registerWithSources(narrowClient, () => RW);
			expect(names).toContain("create_invoice");
			expect(names).toContain("list_bills");
			expect(names).not.toContain("create_contact");
			expect(names).not.toContain("list_payments");
			expect(names).not.toContain("get_profit_and_loss");
		});

		it("both read+write registers all 55 tools", () => {
			const { names } = registerWithSources(RW, () => RW);
			expect(names.sort()).toEqual(CATALOG);
		});
	});

	describe("request-time re-check after the shared token narrows", () => {
		it("a registered write tool fails closed with insufficient_scope and never calls Xero", async () => {
			let upstream = RW;
			const { callbacks, calls } = registerWithSources(RW, () => upstream);
			const createContact = callbacks.get("create_contact");
			expect(createContact).toBeDefined();
			upstream = RO; // another client re-authorised read-only
			const res = await createContact!({ name: "Test" }, {});
			expect(res.isError).toBe(true);
			const body = JSON.parse(res.content[0].text);
			expect(body.code).toBe("insufficient_scope");
			expect(body.required_scope).toBe("accounting.contacts");
			expect(calls).toEqual([]);
		});

		it("a read tool still works after narrowing to read-only", async () => {
			let upstream = RW;
			const { callbacks, calls } = registerWithSources(RW, () => upstream);
			upstream = RO;
			const res = await callbacks.get("list_contacts")!({}, {});
			expect(res.isError).toBeUndefined();
			expect(calls).toEqual(["GET /Contacts"]);
		});

		it("session tools keep working whatever the upstream scopes are", async () => {
			let upstream = RW;
			const { callbacks } = registerWithSources(RW, () => upstream);
			upstream = "openid";
			const res = await callbacks.get("list_granted_scopes")!({}, {});
			expect(res.isError).toBeUndefined();
			const body = JSON.parse(res.content[0].text);
			expect([...body.available_tools].sort()).toEqual(
				["list_granted_scopes", "list_organisations", "set_active_organisation", "xero_whoami"],
			);
			expect(body.withheld_from_this_client).toEqual([]);
			expect(body.unavailable_tools.map((u: { tool: string }) => u.tool)).toContain("create_contact");
		});

		it("list_granted_scopes shows what the shared token holds that this client did not approve", async () => {
			const { callbacks } = registerWithSources(RO, () => RW);
			const res = await callbacks.get("list_granted_scopes")!({}, {});
			const body = JSON.parse(res.content[0].text);
			expect(body.scopes).not.toContain("accounting.contacts");
			expect(body.withheld_from_this_client).toContain("accounting.contacts");
			expect(body.available_tools).not.toContain("create_contact");
		});
	});
});
