import {
	type CpaModel,
	type ModelsDevModel,
	type ProviderModel,
	type ProviderSettings,
	THINKING_LEVELS,
} from "./types.ts";

export const GPT_56_CODEX_CONTEXT = 272_000;
export const GPT_56_MAX_CONTEXT = 400_000;

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
		? settings.gpt56ContextPolicy === "codex"
			? GPT_56_CODEX_CONTEXT
			: Math.min(
				metadata?.contextWindow ?? GPT_56_MAX_CONTEXT,
				GPT_56_MAX_CONTEXT,
			)
		: metadata?.contextWindow ?? 128_000;
	const contextWindow = customContext === undefined
		? derivedContext
		: gpt56
		? Math.min(customContext, GPT_56_MAX_CONTEXT)
		: customContext;
	const supported = new Set(model.reasoningLevels);
	const thinkingLevelMap = Object.fromEntries(
		THINKING_LEVELS.map((
			level,
		) => [
			level,
			supported.has(level) ? (level === "off" ? "none" : level) : null,
		]),
	);
	const reasoning = model.reasoningLevels.some((level) => level !== "off") ||
		(model.reasoningLevels.length === 0 && (metadata?.reasoning ?? false));
	const input = metadata?.input.includes("image")
		? ["text", "image"] as const
		: ["text"] as const;
	return {
		id: model.id,
		name: metadata?.name ?? model.id,
		api: gpt56 ? "openai-responses" : "openai-completions",
		reasoning,
		...(model.reasoningLevels.length > 0 ? { thinkingLevelMap } : {}),
		input: [...input],
		cost: metadata?.cost ??
			{ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow,
		maxTokens: metadata?.maxTokens ?? 16_384,
	};
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
