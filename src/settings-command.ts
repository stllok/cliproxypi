import {
	type ExtensionAPI,
	type ExtensionCommandContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { loadProviderSettings, saveProviderSettings } from "./settings.ts";
import type { ProviderSettings } from "./types.ts";

const DONE = "Done";
const CONTEXT_POLICY = "GPT-5.6 context policy";
const FAST_MODE = "GPT fast mode";
const CUSTOM_CONTEXT = "Custom model context";

export function registerSettingsCommand(
	pi: ExtensionAPI,
	modelIds: readonly string[],
): void {
	pi.registerCommand("cliproxyapi", {
		description: "Configure CLIProxyAPI model limits and GPT fast mode.",
		async handler(args, ctx) {
			const command = args.trim();
			if (
				command !== "" && command !== "settings" && command !== "config"
			) {
				ctx.ui.notify("Usage: /cliproxyapi [settings]", "warning");
				return;
			}
			await openSettingsPanel(ctx, modelIds);
		},
	});
}

export async function openSettingsPanel(
	ctx: ExtensionCommandContext,
	modelIds: readonly string[],
): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify(
			"CLIProxyAPI settings require interactive Pi mode.",
			"warning",
		);
		return;
	}

	const path = join(getAgentDir(), "settings.json");
	let settings = loadProviderSettings(path);
	let changed = false;

	for (;;) {
		const action = await ctx.ui.select("CLIProxyAPI settings", [
			`${CONTEXT_POLICY}: ${settings.gpt56ContextPolicy}`,
			`${FAST_MODE}: ${settings.gptFastMode ? "on" : "off"}`,
			CUSTOM_CONTEXT,
			DONE,
		]);
		if (action === undefined || action === DONE) break;

		if (action.startsWith(CONTEXT_POLICY)) {
			const value = await ctx.ui.select("GPT-5.6 context limit", [
				"codex-save - 272,000 tokens",
				"codex - 400,000 tokens",
				"api - 1,000,000 tokens",
			]);
			if (value) {
				settings = {
					...settings,
					gpt56ContextPolicy: value.startsWith("codex-save")
						? "codex-save"
						: value.startsWith("api")
						? "api"
						: "codex",
				};
				changed = true;
			}
			continue;
		}

		if (action.startsWith(FAST_MODE)) {
			const value = await ctx.ui.select("GPT fast mode (persistent)", [
				"off",
				"on",
			]);
			if (value) {
				settings = { ...settings, gptFastMode: value === "on" };
				changed = true;
			}
			continue;
		}

		if (action === CUSTOM_CONTEXT) {
			const next = await editCustomContext(ctx, settings, modelIds);
			if (next !== settings) {
				settings = next;
				changed = true;
			}
		}
	}

	if (!changed) return;
	saveProviderSettings(path, settings);
	ctx.ui.notify(
		`Saved CLIProxyAPI settings to ${path}. Reloading Pi...`,
		"info",
	);
	await ctx.reload();
}

async function editCustomContext(
	ctx: ExtensionCommandContext,
	settings: ProviderSettings,
	modelIds: readonly string[],
): Promise<ProviderSettings> {
	if (modelIds.length === 0) {
		ctx.ui.notify("No CLIProxyAPI models are available.", "warning");
		return settings;
	}
	const modelId = await ctx.ui.select(
		"Model context override",
		[...modelIds].sort(),
	);
	if (!modelId) return settings;

	const current = settings.customContext[modelId];
	const value = await ctx.ui.input(
		`Context tokens for ${modelId}`,
		current === undefined
			? "positive integer, or auto"
			: `${current} (or auto)`,
	);
	if (value === undefined) return settings;

	const normalized = value.trim().toLowerCase();
	const customContext = { ...settings.customContext };
	if (normalized === "" || normalized === "auto") {
		delete customContext[modelId];
		return { ...settings, customContext };
	}
	const numeric = Number(normalized);
	if (
		!/^\d+$/.test(normalized) || numeric <= 0 ||
		!Number.isSafeInteger(numeric)
	) {
		ctx.ui.notify(
			"Context window must be a positive integer or auto.",
			"error",
		);
		return settings;
	}
	customContext[modelId] = numeric;
	return { ...settings, customContext };
}
