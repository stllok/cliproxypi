import { describe, expect, test } from "bun:test";
import {
	parseProviderSettings,
	withProviderSettings,
} from "../src/settings.ts";

describe("persistent settings", () => {
	test("reads namespaced context and fast-mode settings", () => {
		expect(
			parseProviderSettings({
				cliproxypi: {
					gpt56ContextPolicy: "api",
					customContext: { "kimi-k3-256k": 256_000 },
					gptFastMode: true,
				},
			}),
		).toEqual({
			gpt56ContextPolicy: "api",
			customContext: { "kimi-k3-256k": 256_000 },
			gptFastMode: true,
		});
	});

	test("preserves unrelated Pi settings when saving", () => {
		expect(
			withProviderSettings(
				{ theme: "dark" },
				{
					gpt56ContextPolicy: "codex",
					customContext: {},
					gptFastMode: false,
				},
			),
		).toEqual({
			theme: "dark",
			cliproxypi: {
				gpt56ContextPolicy: "codex",
				customContext: {},
				gptFastMode: false,
			},
		});
	});
});
