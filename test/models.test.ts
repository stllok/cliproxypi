import { describe, expect, test } from "bun:test";
import { buildProviderModel, findModelsDevModel } from "../src/models.ts";
import { applyFastMode } from "../src/provider.ts";
import type {
	CpaModel,
	ModelsDevModel,
	ProviderSettings,
} from "../src/types.ts";

const catalog: readonly ModelsDevModel[] = [
	{
		id: "glm-5.3-flash",
		provider: "zai",
		name: "GLM 5.3 Flash",
		reasoning: true,
		input: ["text", "image"],
		contextWindow: 202_752,
		maxTokens: 65_536,
		cost: { input: 0.2, output: 1.1, cacheRead: 0.02, cacheWrite: 0 },
	},
	{
		id: "gpt-5.6-sol",
		provider: "openai",
		name: "GPT 5.6 Sol",
		reasoning: true,
		input: ["text", "image"],
		contextWindow: 1_050_000,
		maxTokens: 128_000,
		cost: { input: 2.5, output: 15, cacheRead: 0.25, cacheWrite: 0 },
	},
];

const settings = {
	gpt56ContextPolicy: "codex",
	customContext: {},
	gptFastMode: false,
} satisfies ProviderSettings;

describe("model enrichment", () => {
	test("matches prefixed and punctuation-variant model IDs", () => {
		const model: CpaModel = {
			id: "gb10/glm5.3-flash",
			ownedBy: "gb10",
			reasoningLevels: ["low", "high"],
		};
		expect(findModelsDevModel(model, catalog)?.provider).toBe("zai");
	});

	test("publishes metadata and only CPA-advertised reasoning levels", () => {
		const model = buildProviderModel(
			{
				id: "gb10/glm5.3-flash",
				ownedBy: "gb10",
				reasoningLevels: ["low", "high"],
			},
			catalog[0],
			settings,
		);

		expect(model).toMatchObject({
			id: "gb10/glm5.3-flash",
			input: ["text", "image"],
			contextWindow: 202_752,
			maxTokens: 65_536,
			cost: { input: 0.2, output: 1.1, cacheRead: 0.02, cacheWrite: 0 },
			reasoning: true,
			thinkingLevelMap: {
				off: null,
				minimal: null,
				low: "low",
				medium: null,
				high: "high",
				xhigh: null,
				max: null,
			},
		});
	});

	test("uses Codex or capped API context for GPT-5.6", () => {
		const cpa = {
			id: "gpt-5.6-sol",
			reasoningLevels: ["low", "high"],
		} satisfies CpaModel;
		expect(buildProviderModel(cpa, catalog[1], settings).contextWindow)
			.toBe(272_000);
		expect(
			buildProviderModel(cpa, catalog[1], {
				...settings,
				gpt56ContextPolicy: "api",
			}).contextWindow,
		).toBe(400_000);
	});

	test("custom context wins but GPT-5.6 remains capped", () => {
		const glm = {
			id: "kimi-k3-256k",
			reasoningLevels: [],
		} satisfies CpaModel;
		expect(
			buildProviderModel(glm, undefined, {
				...settings,
				customContext: { "kimi-k3-256k": 256_000 },
			}).contextWindow,
		).toBe(256_000);

		const gpt = {
			id: "gpt-5.6-sol",
			reasoningLevels: ["high"],
		} satisfies CpaModel;
		expect(
			buildProviderModel(gpt, catalog[1], {
				...settings,
				customContext: { "gpt-5.6-sol": 900_000 },
			}).contextWindow,
		).toBe(400_000);
	});

	test("persistent fast mode modifies GPT request payloads only", () => {
		expect(applyFastMode({ input: [] }, "gpt-5.6-sol", true)).toEqual({
			input: [],
			service_tier: "fast",
		});
		expect(applyFastMode({ messages: [] }, "glm-5.3-flash", true)).toEqual({
			messages: [],
		});
		expect(applyFastMode({ input: [] }, "gpt-5.6-sol", false)).toEqual({
			input: [],
		});
	});
});
