import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { effectiveScopes } from "../auth/effective-scopes";
import type { Props } from "../auth/props";
import { canRegisterTool, parseGrantedScopes, TOOL_SCOPE_MAP } from "../auth/scopes";
import type { XeroClient } from "../xero/client";
import { toolError, XeroApiError } from "../xero/errors";
import { registerAttachmentTools } from "./tools/attachments";
import { registerBankTools } from "./tools/bank";
import { registerContactTools } from "./tools/contacts";
import { registerInvoiceTools } from "./tools/invoices";
import { registerOrgTools } from "./tools/org";
import { registerPaymentTools } from "./tools/payments";
import { registerReportTools } from "./tools/reports";
import { registerSettingsTools } from "./tools/settings";

export type RegistrationResult = {
	/** Tools exposed to the MCP client for this session */
	registered: string[];
	/** Tools hidden because the session lacks a required scope */
	skipped: string[];
	/** Tools implemented in code but missing from TOOL_SCOPE_MAP (always a bug) */
	unmapped: string[];
};

export type ScopeSources = {
	/** Scopes THIS client's user approved at its own consent. Fixed per MCP token. */
	clientGrant: () => string;
	/** Scopes carried by the Xero tokens the session uses right now (may be shared). */
	upstream: () => string;
};

/** Effective scope set for a session: client grant ∩ upstream tokens. */
export function sessionScopes(sources: ScopeSources): Set<string> {
	return effectiveScopes(
		parseGrantedScopes(sources.clientGrant()),
		parseGrantedScopes(sources.upstream()),
	);
}

/**
 * Register tools, filtering by the session's effective scopes.
 * Org/session tools always register.
 *
 * Every registered tool is also re-checked at invocation time, because in a
 * deployment with a shared token store the upstream scope set can change after
 * registration. A tool whose scope was lost fails closed with `insufficient_scope`
 * instead of reaching Xero.
 *
 * Note: McpServer.tool() registers immediately. We wrap domain registrars
 * by temporarily patching server.tool to gate by TOOL_SCOPE_MAP.
 */
export function registerAllTools(
	server: McpServer,
	getClient: () => XeroClient,
	getProps: () => Props,
	setActiveTenant: (tenantId: string) => void | Promise<void>,
	sources?: Partial<ScopeSources>,
): RegistrationResult {
	const scopeSources: ScopeSources = {
		clientGrant: sources?.clientGrant ?? (() => getProps().scopes),
		upstream: sources?.upstream ?? (() => getProps().scopes),
	};
	const granted = sessionScopes(scopeSources);
	const result: RegistrationResult = { registered: [], skipped: [], unmapped: [] };

	const originalTool = server.tool.bind(server);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(server as any).tool = (name: string, ...rest: unknown[]) => {
		if (!(name in TOOL_SCOPE_MAP)) {
			// Fail loud (but not fatal): a tool without a scope entry can never be exposed.
			console.error(`xero-mcp: tool "${name}" is not in TOOL_SCOPE_MAP and will not be registered`);
			result.unmapped.push(name);
			return server;
		}
		if (!canRegisterTool(name, granted)) {
			result.skipped.push(name);
			return server;
		}
		result.registered.push(name);
		const guarded = guardInvocation(name, rest, scopeSources);
		// @ts-expect-error rest spread matches overloads
		return originalTool(name, ...guarded);
	};

	try {
		registerOrgTools(server, getClient, getProps, setActiveTenant, scopeSources);
		registerContactTools(server, getClient);
		registerInvoiceTools(server, getClient);
		registerPaymentTools(server, getClient);
		registerBankTools(server, getClient);
		registerReportTools(server, getClient);
		registerSettingsTools(server, getClient);
		registerAttachmentTools(server, getClient);
	} finally {
		// restore
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(server as any).tool = originalTool;
	}

	return result;
}

/** Wrap the tool callback (always the last argument) with a request-time scope check. */
function guardInvocation(name: string, rest: unknown[], sources: ScopeSources): unknown[] {
	const idx = rest.length - 1;
	const cb = rest[idx];
	if (typeof cb !== "function") return rest;
	const wrapped = async (...args: unknown[]) => {
		const now = sessionScopes(sources);
		if (!canRegisterTool(name, now)) {
			const req = TOOL_SCOPE_MAP[name]?.anyOf ?? [];
			return toolError(
				new XeroApiError(
					`Tool ${name} is no longer permitted for this session: the Xero authorisation behind it changed after connection. Disconnect and reconnect this MCP server, then re-authorise at Xero.`,
					403,
					"insufficient_scope",
					undefined,
					req.join(" or "),
				),
			);
		}
		return (cb as (...a: unknown[]) => unknown)(...args);
	};
	const out = rest.slice();
	out[idx] = wrapped;
	return out;
}
