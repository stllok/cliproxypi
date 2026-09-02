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
	customMaxTokens: {},
	gptFastMode: false,
	thinkingLevelSource: {},
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
				cliproxyReasoningLevels: ["low", "high", "max"],
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
				max: "max",
			},
		});
	});

	test("selects per-model thinking-level source", () => {
		const model = {
			id: "qwen3.8-max",
			reasoningLevels: ["low", "medium"],
			cliproxyReasoningLevels: ["medium", "xhigh"],
		} satisfies CpaModel;

		expect(
			buildProviderModel(model, undefined, {
				...settings,
				thinkingLevelSource: { "qwen3.8-max": "api" },
			}).thinkingLevelMap,
		).toMatchObject({ low: "low", medium: "medium", xhigh: null });
		expect(
			buildProviderModel(model, undefined, {
				...settings,
				thinkingLevelSource: { "qwen3.8-max": "hardcoded" },
			}).thinkingLevelMap,
		).toMatchObject({ low: "low", medium: "medium", xhigh: "xhigh" });
		expect(
			buildProviderModel(model, undefined, {
				...settings,
				thinkingLevelSource: { "qwen3.8-max": "all" },
			}).thinkingLevelMap,
		).toEqual({
			off: "none",
			minimal: "minimal",
			low: "low",
			medium: "medium",
			high: "high",
			xhigh: "xhigh",
			max: "max",
		});
	});

	test("hardcodes documented Kimi and GLM effort levels", () => {
		for (const id of ["kimi-k3", "glm-5.3-flash"]) {
			const model = buildProviderModel(
				{ id, reasoningLevels: [], cliproxyReasoningLevels: [] },
				undefined,
				{
					...settings,
					thinkingLevelSource: { [id]: "hardcoded" },
				},
			);
			expect(model.thinkingLevelMap).toMatchObject({
				off: null,
				low: "low",
				high: "high",
				max: "max",
			});
		}
	});

	test("uses configured GPT-5.6 context profile", () => {
		const cpa = {
			id: "gpt-5.6-sol",
			reasoningLevels: ["low", "high"],
		} satisfies CpaModel;
		expect(buildProviderModel(cpa, catalog[1], settings).contextWindow)
			.toBe(400_000);
		expect(
			buildProviderModel(cpa, catalog[1], {
				...settings,
				gpt56ContextPolicy: "codex-save",
			}).contextWindow,
		).toBe(272_000);
		expect(
			buildProviderModel(cpa, catalog[1], {
				...settings,
				gpt56ContextPolicy: "api",
			}).contextWindow,
		).toBe(1_000_000);
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
		).toBe(900_000);
	});

	test("orders context sources as custom, extension, models.dev, fallback", () => {
		const kimi = {
			id: "kimi-k3-256k",
			reasoningLevels: [],
		} satisfies CpaModel;
		const baseMetadata = catalog[0];
		if (!baseMetadata) throw new Error("Expected models.dev fixture");
		const metadata = {
			...baseMetadata,
			id: kimi.id,
			contextWindow: 1_048_576,
		} satisfies ModelsDevModel;

		expect(
			buildProviderModel(kimi, metadata, {
				...settings,
				customContext: { [kimi.id]: 192_000 },
			}).contextWindow,
		).toBe(192_000);
		expect(buildProviderModel(kimi, metadata, settings).contextWindow)
			.toBe(256_000);
		expect(
			buildProviderModel(
				{ id: "catalog-model", reasoningLevels: [] },
				{ ...metadata, id: "catalog-model", contextWindow: 64_000 },
				settings,
			).contextWindow,
		).toBe(64_000);
		expect(
			buildProviderModel(
				{ id: "cliproxy-only", reasoningLevels: [] },
				undefined,
				settings,
			).contextWindow,
		).toBe(128_000);
	});

	test("custom input and output token limits override models.dev", () => {
		expect(
			buildProviderModel(
				{ id: "gb10/glm5.3-flash", reasoningLevels: [] },
				catalog[0],
				{
					...settings,
					customContext: { "gb10/glm5.3-flash": 512_000 },
					customMaxTokens: { "gb10/glm5.3-flash": 96_000 },
				},
			),
		).toMatchObject({
			contextWindow: 512_000,
			maxTokens: 96_000,
		});
	});

	test("marks Chat Completions models as not supporting developer roles", () => {
		expect(
			buildProviderModel(
				{ id: "kimi-k3", reasoningLevels: ["high"] },
				undefined,
				settings,
			).compat,
		).toEqual({ supportsDeveloperRole: false });
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
