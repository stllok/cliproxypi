import { z } from "zod";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ProviderSettings } from "./types.ts";

export const SETTINGS_NAMESPACE = "cliproxypi";
export const DEFAULT_SETTINGS: ProviderSettings = {
	gpt56ContextPolicy: "codex",
	customContext: {},
	gptFastMode: false,
};

const providerSettingsSchema = z
	.object({
		gpt56ContextPolicy: z.enum(["codex", "api"]).default("codex"),
		customContext: z.record(z.string().min(1), z.number().int().positive())
			.default({}),
		gptFastMode: z.boolean().default(false),
	})
	.default(DEFAULT_SETTINGS);
const rootSettingsSchema = z.record(z.string(), z.unknown());

export function parseProviderSettings(payload: unknown): ProviderSettings {
	const root = rootSettingsSchema.safeParse(payload);
	return root.success
		? providerSettingsSchema.parse(root.data[SETTINGS_NAMESPACE])
		: DEFAULT_SETTINGS;
}

export function withProviderSettings(
	root: Readonly<Record<string, unknown>>,
	settings: ProviderSettings,
): Readonly<Record<string, unknown>> {
	return { ...root, [SETTINGS_NAMESPACE]: settings };
}

export function loadProviderSettings(path: string): ProviderSettings {
	if (!existsSync(path)) return DEFAULT_SETTINGS;
	return parseProviderSettings(JSON.parse(readFileSync(path, "utf8")));
}

export function saveProviderSettings(
	path: string,
	settings: ProviderSettings,
): void {
	const root = existsSync(path)
		? rootSettingsSchema.parse(JSON.parse(readFileSync(path, "utf8")))
		: {};
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	writeFileSync(
		path,
		`${
			JSON.stringify(
				withProviderSettings(root, settings),
				null,
				2,
			)
		}\n`,
		{ encoding: "utf8", mode: 0o600 },
	);
}
