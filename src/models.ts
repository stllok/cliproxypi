import {
	type ContextPolicy,
	type CpaModel,
	type ModelsDevModel,
	type ProviderModel,
	type ProviderSettings,
	THINKING_LEVELS,
	type ThinkingLevel,
} from "./types.ts";

export const GPT_56_CONTEXT = {
	"codex-save": 272_000,
	codex: 400_000,
	api: 1_000_000,
} as const satisfies Record<ContextPolicy, number>;

export function findModelsDevModel(
	model: CpaModel,
	catalog: readonly ModelsDevModel[],
): ModelsDevModel | undefined {
	const normalized = normalizeModelId(model.id);
	const matches = catalog.filter((candidate) =>
		normalizeModelId(candidate.id) === normalized
	);
	if (matches.length <= 1) return matches[0];

	const owner = model.ownedBy?.toLowerCase();
	const ownerMatch = owner
		? matches.find((candidate) =>
			candidate.provider.toLowerCase() === owner
		)
		: undefined;
	if (ownerMatch) return ownerMatch;

	const canonicalProvider = canonicalProviderFor(normalized);
	return matches.find((candidate) =>
		candidate.provider === canonicalProvider
	);
}

export function buildProviderModel(
	model: CpaModel,
	metadata: ModelsDevModel | undefined,
	settings: ProviderSettings,
): ProviderModel {
	const gpt56 = isGpt56(model.id);
	const customContext = settings.customContext[model.id];
	const derivedContext = gpt56
		? GPT_56_CONTEXT[settings.gpt56ContextPolicy]
		: normalizeModelId(model.id) === "kimik3256k"
		? 256_000
		: metadata?.contextWindow ?? 128_000;
	const contextWindow = customContext === undefined
		? derivedContext
		: gpt56
		? Math.min(customContext, GPT_56_CONTEXT.api)
		: customContext;
	const source = settings.thinkingLevelSource[model.id] ?? "cliproxyapi";
	const selectedLevels = (() => {
		switch (source) {
			case "api":
				return model.reasoningLevels;
			case "cliproxyapi":
				return model.cliproxyReasoningLevels ?? [];
			case "hardcoded":
				return hardcodedThinkingLevels(model.id);
			case "all":
				return THINKING_LEVELS;
		}
	})();
	const supported = new Set(selectedLevels);
	const thinkingLevelMap = Object.fromEntries(
		THINKING_LEVELS.map((
			level,
		) => [
			level,
			supported.has(level) ? (level === "off" ? "none" : level) : null,
		]),
	);
	const reasoning = selectedLevels.some((level) => level !== "off") ||
		model.reasoningLevels.some((level) => level !== "off") ||
		(metadata?.reasoning ?? false);
	const input = metadata?.input.includes("image")
		? ["text", "image"] as const
		: ["text"] as const;
	return {
		id: model.id,
		name: metadata?.name ?? model.id,
		api: gpt56 ? "openai-responses" : "openai-completions",
		...(gpt56 ? {} : { compat: { supportsDeveloperRole: false } }),
		reasoning,
		...(selectedLevels.length > 0 ? { thinkingLevelMap } : {}),
		input: [...input],
		cost: metadata?.cost ??
			{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow,
		maxTokens: settings.customMaxTokens[model.id] ??
			metadata?.maxTokens ?? 16_384,
	};
}

function hardcodedThinkingLevels(id: string): readonly ThinkingLevel[] {
	const normalized = normalizeModelId(id);
	if (normalized.startsWith("kimik3")) return ["low", "high", "max"];
	if (normalized.startsWith("glm53flash")) return ["low", "high", "max"];
	if (normalized.startsWith("qwen38max")) return ["low", "medium", "xhigh"];
	if (normalized.startsWith("qwen38flash")) return ["high", "max"];
	if (normalized.startsWith("qwen38")) {
		return ["off", "low", "medium", "xhigh"];
	}
	return [];
}

function normalizeModelId(id: string): string {
	const modelName = id.slice(id.lastIndexOf("/") + 1);
	return modelName.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

function canonicalProviderFor(normalizedId: string): string | undefined {
	if (normalizedId.startsWith("gpt")) return "openai";
	if (normalizedId.startsWith("claude")) return "anthropic";
	if (normalizedId.startsWith("gemini")) return "google";
	if (normalizedId.startsWith("glm")) return "zai";
	if (normalizedId.startsWith("qwen")) return "alibaba";
	if (normalizedId.startsWith("kimi")) return "moonshotai";
	if (normalizedId.startsWith("grok")) return "xai";
	if (normalizedId.startsWith("deepseek")) return "deepseek";
	if (normalizedId.startsWith("minimax")) return "minimax";
	return undefined;
}

function isGpt56(id: string): boolean {
	return normalizeModelId(id).startsWith("gpt56");
}
