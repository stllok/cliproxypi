import type { ProviderModelConfig } from "@earendil-works/pi-coding-agent";
import type { Model } from "@earendil-works/pi-ai";

export const THINKING_LEVELS = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
	"max",
] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];
export const THINKING_LEVEL_SOURCES = [
	"hardcoded",
	"api",
	"cliproxyapi",
	"all",
] as const;
export type ThinkingLevelSource = (typeof THINKING_LEVEL_SOURCES)[number];

export type CpaModel = {
	readonly id: string;
	readonly ownedBy?: string;
	readonly reasoningLevels: readonly ThinkingLevel[];
	readonly cliproxyReasoningLevels?: readonly ThinkingLevel[];
};

export type ModelsDevModel = {
	readonly id: string;
	readonly provider: string;
	readonly name?: string;
	readonly reasoning?: boolean;
	readonly input: readonly string[];
	readonly contextWindow?: number;
	readonly maxTokens?: number;
	readonly cost: {
		readonly input: number;
		readonly output: number;
		readonly cacheRead: number;
		readonly cacheWrite: number;
	};
};

export type ContextPolicy = "codex-save" | "codex" | "api";

export type ProviderSettings = {
	readonly gpt56ContextPolicy: ContextPolicy;
	readonly customContext: Readonly<Record<string, number>>;
	readonly customMaxTokens: Readonly<Record<string, number>>;
	readonly gptFastMode: boolean;
	readonly thinkingLevelSource: Readonly<Record<string, ThinkingLevelSource>>;
};

export type CliProxyApi =
	| "openai-completions"
	| "openai-responses";

export type ProviderModel =
	& Omit<ProviderModelConfig, "api" | "compat">
	& {
		readonly api?: CliProxyApi;
		readonly compat?: Model<CliProxyApi>["compat"];
	};
