import type {
	ModelsDevModel,
	ProviderModel,
	ProviderSettings,
} from "./types.ts";
import {
	parseCpaModels,
	parseCpaThinkingLevels,
	parseModelsDev,
} from "./discovery.ts";
import { buildProviderModel, findModelsDevModel } from "./models.ts";
import { ZodError } from "zod";

const MODELS_DEV_URL = "https://models.dev/api.json";

export type JsonGetter = (
	url: string,
	headers: Readonly<Record<string, string>>,
) => Promise<unknown>;

export type DiscoveryOptions = {
	readonly baseUrl: string;
	readonly apiKey?: string;
	readonly modelsDevUrl?: string;
	readonly settings: ProviderSettings;
	readonly getJson: JsonGetter;
};

export async function discoverProviderModels(
	options: DiscoveryOptions,
): Promise<ProviderModel[]> {
	const headers = options.apiKey
		? { Authorization: `Bearer ${options.apiKey}` }
		: {};
	const baseUrl = options.baseUrl.replace(/\/+$/, "");
	const [cpaResult, richCatalogResult, metadataResult] = await Promise
		.allSettled([
			options.getJson(`${baseUrl}/models`, headers),
			options.getJson(`${baseUrl}/models?client_version=pi`, headers),
			options.getJson(options.modelsDevUrl ?? MODELS_DEV_URL, {}),
		]);
	if (cpaResult.status === "rejected") {
		const message = cpaResult.reason instanceof Error
			? cpaResult.reason.message
			: String(cpaResult.reason);
		console.warn(
			`[cliproxypi] CPA model discovery failed; provider loaded with no models: ${message}`,
		);
		return [];
	}
	const cpaModels = parseCpaModels(cpaResult.value);
	let richLevels: ReturnType<typeof parseCpaThinkingLevels> = {};
	if (richCatalogResult.status === "fulfilled") {
		try {
			richLevels = parseCpaThinkingLevels(richCatalogResult.value);
		} catch (error) {
			if (!(error instanceof ZodError)) throw error;
		}
	}
	let catalog: ModelsDevModel[] = [];
	if (metadataResult.status === "fulfilled") {
		try {
			catalog = parseModelsDev(metadataResult.value);
		} catch (error) {
			if (!(error instanceof ZodError)) throw error;
			const issue = error.issues[0];
			console.warn(
				`[cliproxypi] models.dev response was invalid; using CPA defaults: ${
					issue
						? `${issue.path.join(".")}: ${issue.message}`
						: "unknown schema error"
				}`,
			);
		}
	} else {
		const message = metadataResult.reason instanceof Error
			? metadataResult.reason.message
			: String(metadataResult.reason);
		console.warn(
			`[cliproxypi] models.dev refresh failed; using CPA defaults: ${message}`,
		);
	}
	return cpaModels.map((model) =>
		buildProviderModel(
			{
				...model,
				cliproxyReasoningLevels: richLevels[model.id] ?? [],
			},
			findModelsDevModel(model, catalog),
			options.settings,
		)
	);
}

export function applyFastMode(
	payload: unknown,
	modelId: string,
	enabled: boolean,
): unknown {
	if (
		!enabled || !isGpt(modelId) || !payload ||
		typeof payload !== "object" || Array.isArray(payload)
	) {
		return payload;
	}
	return { ...payload, service_tier: "fast" };
}

function isGpt(modelId: string): boolean {
	const name = modelId.slice(modelId.lastIndexOf("/") + 1);
	return name.toLowerCase().replaceAll(/[^a-z0-9]/g, "").startsWith("gpt");
}
