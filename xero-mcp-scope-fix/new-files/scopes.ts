/**
 * Xero granular OAuth scopes (required for apps created on/after 2026-03-02).
 * Broad scopes `accounting.transactions` and `accounting.reports.read` are deprecated.
 *
 * Design rule: TOOL_SCOPE_MAP is the single source of truth. The consent presets
 * (`read` and `readwrite`) are DERIVED from it, so:
 *   - "Read + write" always requests exactly the scopes needed by every implemented tool;
 *   - no scope is requested that no tool uses;
 *   - a tool can never be implemented but unreachable under the readwrite preset.
 * `npm test` enforces these invariants.
 *
 * @see https://developer.xero.com/documentation/guides/oauth2/scopes/
 */

/** OpenID + offline for identity and refresh tokens */
export const IDENTITY_SCOPES = [
	"openid",
	"profile",
	"email",
	"offline_access",
] as const;

export type ScopePreset = "read" | "readwrite";

/**
 * Tool → required scopes. A tool is registered if the user has ANY listed
 * alternative (e.g. write scope satisfies read tools for that family).
 */
export type ScopeRequirement = {
	/** Any one of these groups must be fully satisfied (OR of ANDs). Usually one scope each. */
	anyOf: string[];
};

/** Tool catalog for gating. Every tool registered in src/mcp/tools/* MUST appear here. */
export const TOOL_SCOPE_MAP: Record<string, ScopeRequirement> = {
	// Always available once authenticated
	xero_whoami: { anyOf: [] },
	list_organisations: { anyOf: [] },
	set_active_organisation: { anyOf: [] },
	list_granted_scopes: { anyOf: [] },

	// Contacts
	list_contacts: { anyOf: ["accounting.contacts.read"] },
	get_contact: { anyOf: ["accounting.contacts.read"] },
	create_contact: { anyOf: ["accounting.contacts"] },
	update_contact: { anyOf: ["accounting.contacts"] },

	// AR / AP (invoices family)
	list_invoices: { anyOf: ["accounting.invoices.read"] },
	get_invoice: { anyOf: ["accounting.invoices.read"] },
	create_invoice: { anyOf: ["accounting.invoices"] },
	update_invoice: { anyOf: ["accounting.invoices"] },
	email_invoice: { anyOf: ["accounting.invoices"] },
	list_bills: { anyOf: ["accounting.invoices.read"] },
	create_bill: { anyOf: ["accounting.invoices"] },
	update_bill: { anyOf: ["accounting.invoices"] },
	list_credit_notes: { anyOf: ["accounting.invoices.read"] },
	create_credit_note: { anyOf: ["accounting.invoices"] },
	allocate_credit_note: { anyOf: ["accounting.invoices"] },
	list_quotes: { anyOf: ["accounting.invoices.read"] },
	create_quote: { anyOf: ["accounting.invoices"] },
	list_purchase_orders: { anyOf: ["accounting.invoices.read"] },
	create_purchase_order: { anyOf: ["accounting.invoices"] },
	list_repeating_invoices: { anyOf: ["accounting.invoices.read"] },
	list_items: { anyOf: ["accounting.invoices.read", "accounting.settings.read"] },

	// Payments
	list_payments: { anyOf: ["accounting.payments.read"] },
	get_payment: { anyOf: ["accounting.payments.read"] },
	create_payment: { anyOf: ["accounting.payments"] },
	delete_payment: { anyOf: ["accounting.payments"] },
	list_batch_payments: { anyOf: ["accounting.payments.read"] },
	create_batch_payment: { anyOf: ["accounting.payments"] },
	list_overpayments: { anyOf: ["accounting.payments.read"] },
	allocate_overpayment: { anyOf: ["accounting.payments"] },
	list_prepayments: { anyOf: ["accounting.payments.read"] },
	allocate_prepayment: { anyOf: ["accounting.payments"] },

	// Banking
	list_bank_transactions: { anyOf: ["accounting.banktransactions.read"] },
	get_bank_transaction: { anyOf: ["accounting.banktransactions.read"] },
	create_bank_transaction: { anyOf: ["accounting.banktransactions"] },
	update_bank_transaction: { anyOf: ["accounting.banktransactions"] },
	list_bank_transfers: { anyOf: ["accounting.banktransactions.read"] },
	create_bank_transfer: { anyOf: ["accounting.banktransactions"] },

	// Settings (all read-only tools: no settings write scope is ever requested)
	list_accounts: { anyOf: ["accounting.settings.read"] },
	list_tax_rates: { anyOf: ["accounting.settings.read"] },
	list_tracking_categories: { anyOf: ["accounting.settings.read"] },
	list_currencies: { anyOf: ["accounting.settings.read"] },
	get_organisation: { anyOf: ["accounting.settings.read"] },

	// Reports (read-only by design)
	get_profit_and_loss: { anyOf: ["accounting.reports.profitandloss.read"] },
	get_balance_sheet: { anyOf: ["accounting.reports.balancesheet.read"] },
	get_trial_balance: { anyOf: ["accounting.reports.trialbalance.read"] },
	get_executive_summary: { anyOf: ["accounting.reports.executivesummary.read"] },
	get_bank_summary: { anyOf: ["accounting.reports.banksummary.read"] },
	get_aged_receivables: { anyOf: ["accounting.reports.aged.read"] },
	get_aged_payables: { anyOf: ["accounting.reports.aged.read"] },

	// Attachments
	list_attachments: { anyOf: ["accounting.attachments.read"] },
	upload_attachment: { anyOf: ["accounting.attachments"] },
};

/** `accounting.contacts` → `accounting.contacts.read`; `.read` scopes unchanged. */
export function toReadScope(scope: string): string {
	return scope.endsWith(".read") ? scope : `${scope}.read`;
}

/** True for a Xero write scope (no `.read` suffix, not identity). */
export function isWriteScope(scope: string): boolean {
	return scope.startsWith("accounting.") && !scope.endsWith(".read");
}

function sortedUnique(values: Iterable<string>): string[] {
	return [...new Set(values)].sort();
}

/** Every scope referenced by any tool, exactly as written in the map. */
export const ALL_TOOL_SCOPES: readonly string[] = sortedUnique(
	Object.values(TOOL_SCOPE_MAP).flatMap((r) => r.anyOf),
);

/** Read-only accounting scopes: the `.read` form of every scope any tool needs. */
export const READ_SCOPES: readonly string[] = sortedUnique(ALL_TOOL_SCOPES.map(toReadScope));

/** Write scopes needed by at least one write tool (write implies read for that family). */
export const WRITE_SCOPES: readonly string[] = ALL_TOOL_SCOPES.filter(isWriteScope);

/** Report scopes are read-only by design. */
export const REPORT_SCOPES: readonly string[] = READ_SCOPES.filter((s) =>
	s.startsWith("accounting.reports."),
);

/**
 * Read + write preset: every write scope any tool needs, plus the read scopes of
 * families that have no write tool (e.g. settings, reports). Read scopes whose write
 * parent is already requested are omitted because Xero write scopes include read.
 */
export const READWRITE_SCOPES: readonly string[] = sortedUnique(
	ALL_TOOL_SCOPES.filter((s) => {
		if (isWriteScope(s)) return true;
		const parent = s.replace(/\.read$/, "");
		return !WRITE_SCOPES.includes(parent);
	}),
);

export function scopesForPreset(preset: ScopePreset): string[] {
	if (preset === "read") {
		return [...IDENTITY_SCOPES, ...READ_SCOPES];
	}
	return [...IDENTITY_SCOPES, ...READWRITE_SCOPES];
}

export function scopeString(preset: ScopePreset, override?: string): string {
	if (override?.trim()) {
		return override.trim().split(/\s+/).join(" ");
	}
	return scopesForPreset(preset).join(" ");
}

/**
 * Human-readable bullets shown on the consent screen.
 */
export function scopeBullets(preset: ScopePreset): string[] {
	if (preset === "read") {
		return [
			"View contacts (customers and suppliers)",
			"View invoices, bills, credit notes, quotes, purchase orders, repeating invoices and items",
			"View payments, batch payments, overpayments, and prepayments",
			"View bank transactions and transfers",
			"View chart of accounts, tax rates, tracking categories, currencies and organisation details",
			"View financial reports (P&L, balance sheet, trial balance, executive summary, aged AR/AP, bank summary)",
			"View document attachments",
		];
	}
	return [
		"Create and update contacts",
		"Create, update and email invoices; create and update bills; create credit notes, quotes and purchase orders",
		"Record and delete payments, create batch payments, allocate credit notes, overpayments and prepayments",
		"Create and update bank transactions and transfers",
		"View chart of accounts, tax rates, tracking categories, currencies and organisation details (read only)",
		"View financial reports (P&L, balance sheet, trial balance, executive summary, aged AR/AP, bank summary)",
		"Upload and view document attachments",
		"Note: writes default to DRAFT where possible; destructive actions require explicit confirmation",
	];
}

/** True if granted scopes include `required` or its write parent (strip .read). */
export function hasScope(granted: Set<string>, required: string): boolean {
	if (granted.has(required)) return true;
	// write scope implies read
	if (required.endsWith(".read")) {
		const write = required.replace(/\.read$/, "");
		if (granted.has(write)) return true;
	}
	// accounting.reports.* are already .read only
	return false;
}

export function hasAnyScope(granted: Set<string>, anyOf: string[]): boolean {
	return anyOf.some((s) => hasScope(granted, s));
}

export function parseGrantedScopes(scopeStringValue: string | undefined | null): Set<string> {
	if (!scopeStringValue) return new Set();
	return new Set(scopeStringValue.split(/\s+/).filter(Boolean));
}

export function canRegisterTool(toolName: string, granted: Set<string>): boolean {
	const req = TOOL_SCOPE_MAP[toolName];
	if (!req) return false;
	if (req.anyOf.length === 0) return true;
	return hasAnyScope(granted, req.anyOf);
}

/** True if the tool's requirement is satisfiable with read-only scopes. */
export function isReadTool(toolName: string): boolean {
	const req = TOOL_SCOPE_MAP[toolName];
	if (!req) return false;
	return req.anyOf.length === 0 || req.anyOf.some((s) => !isWriteScope(s));
}

export type ToolAvailability = {
	available: string[];
	unavailable: { tool: string; requires_any_of: string[] }[];
};

/** Which catalog tools a set of granted scopes exposes, and why the rest are hidden. */
export function toolAvailability(granted: Set<string>): ToolAvailability {
	const available: string[] = [];
	const unavailable: ToolAvailability["unavailable"] = [];
	for (const [tool, req] of Object.entries(TOOL_SCOPE_MAP)) {
		if (canRegisterTool(tool, granted)) available.push(tool);
		else unavailable.push({ tool, requires_any_of: req.anyOf });
	}
	return { available, unavailable };
}
