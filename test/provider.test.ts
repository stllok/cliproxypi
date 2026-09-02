import { describe, expect, test } from "bun:test";
import { discoverProviderModels } from "../src/provider.ts";
import type { ProviderSettings } from "../src/types.ts";

const settings = {
	gpt56ContextPolicy: "api",
	customContext: {},
	customMaxTokens: {},
	gptFastMode: false,
	thinkingLevelSource: {},
} satisfies ProviderSettings;

describe("startup discovery", () => {
	test("fetches standard, rich CPA, and models.dev catalogs", async () => {
		const calls: string[] = [];
		const getJson = async (url: string): Promise<unknown> => {
			calls.push(url);
			if (url.endsWith("/models")) {
				return {
					data: [{
						id: "gpt-5.6-sol",
						supported_reasoning_efforts: ["high"],
					}],
				};
			}
			if (url.endsWith("/models?client_version=pi")) {
				return {
					models: [{
						slug: "gpt-5.6-sol",
						supported_reasoning_levels: [{ effort: "high" }],
					}],
				};
			}
			return {
				openai: {
					models: {
						"gpt-5.6-sol": {
							id: "gpt-5.6-sol",
							limit: { context: 1_050_000, output: 128_000 },
							modalities: { input: ["text", "image"] },
						},
					},
				},
			};
		};

		const first = await discoverProviderModels({
			baseUrl: "http://localhost:8317/v1/",
			apiKey: "secret",
			settings,
			getJson,
		});
		await discoverProviderModels({
			baseUrl: "http://localhost:8317/v1/",
			apiKey: "secret",
			settings,
			getJson,
		});

		expect(calls).toEqual([
			"http://localhost:8317/v1/models",
			"http://localhost:8317/v1/models?client_version=pi",
			"https://models.dev/api.json",
			"http://localhost:8317/v1/models",
			"http://localhost:8317/v1/models?client_version=pi",
			"https://models.dev/api.json",
		]);
		expect(first[0]).toMatchObject({
			id: "gpt-5.6-sol",
			contextWindow: 1_000_000,
			maxTokens: 128_000,
			input: ["text", "image"],
		});
	});

	test("keeps live CPA models when models.dev is unavailable", async () => {
		const getJson = async (url: string): Promise<unknown> => {
			if (url.endsWith("/models")) {
				return {
					data: [{
						id: "gpt-5.6-sol",
						supported_reasoning_efforts: ["low", "high"],
					}],
				};
			}
			if (url.endsWith("/models?client_version=pi")) {
				return {
					data: [{
						id: "gpt-5.6-sol",
						supported_reasoning_efforts: ["low", "high"],
					}],
				};
			}
			throw new Error("models.dev unavailable");
		};

		const models = await discoverProviderModels({
			baseUrl: "http://localhost:8317/v1",
			settings: { ...settings, gpt56ContextPolicy: "codex" },
			getJson,
		});

		expect(models[0]).toMatchObject({
			id: "gpt-5.6-sol",
			contextWindow: 400_000,
			reasoning: true,
		});
	});

	test("loads with no models when CPA is unavailable", async () => {
		const models = await discoverProviderModels({
			baseUrl: "http://localhost:8317/v1",
			settings,
			getJson: () => Promise.reject(new Error("CPA unavailable")),
		});

		expect(models).toEqual([]);
	});
});
