import {
	type ExtensionAPI,
	getAgentDir,
	readStoredCredential,
} from "@earendil-works/pi-coding-agent";
import {
	type ApiKeyCredential,
	createProvider,
	lazyApi,
	type Model,
} from "@earendil-works/pi-ai";
import ky from "ky";
import { join } from "node:path";
import {
	API_KEY_ENV,
	createCliProxyApiAuth,
	credentialBaseUrl,
} from "../src/auth.ts";
import {
	applyFastMode,
	discoverProviderModels,
	type JsonGetter,
} from "../src/provider.ts";
import { registerSettingsCommand } from "../src/settings-command.ts";
import { loadProviderSettings } from "../src/settings.ts";
import type { CliProxyApi } from "../src/types.ts";

const DEFAULT_BASE_URL = "http://localhost:8317/v1";
export const DEFAULT_PROVIDER_NAME = "cliproxypi";
const PI_AI_ENTRYPOINT = import.meta.resolve("@earendil-works/pi-ai");

export function piAiApiModuleUrl(
	entrypoint: string,
	api: CliProxyApi,
): string {
	return new URL(`./api/${api}.js`, entrypoint).href;
}

function storedCredential(providerName: string): ApiKeyCredential | undefined {
	const credential = readStoredCredential(providerName);
	return credential?.type === "api_key" ? credential : undefined;
}

const getJson: JsonGetter = async (url, headers) =>
	ky.get(url, {
		headers,
		retry: 0,
		timeout: 60_000,
	}).json<unknown>();

export default async function cliproxypi(pi: ExtensionAPI): Promise<void> {
	const {
		CLIPROXYAPI_PROVIDER_NAME,
		CLIPROXYAPI_MODELS_DEV_URL,
	} = process.env;
	const providerName = CLIPROXYAPI_PROVIDER_NAME?.trim() ||
		DEFAULT_PROVIDER_NAME;
	const credential = storedCredential(providerName);
	const baseUrl = credentialBaseUrl(credential, DEFAULT_BASE_URL);
	const apiKey = credential?.key ?? process.env[API_KEY_ENV];
	const settings = loadProviderSettings(join(getAgentDir(), "settings.json"));
	let models = await discoverProviderModels({
		baseUrl,
		...(apiKey ? { apiKey } : {}),
		...(CLIPROXYAPI_MODELS_DEV_URL
			? { modelsDevUrl: CLIPROXYAPI_MODELS_DEV_URL }
			: {}),
		settings,
		getJson,
	});

	const runtimeModels = (
		items: typeof models,
		modelBaseUrl: string,
	): Model<CliProxyApi>[] =>
		items.map((model) => {
			const api = model.api ?? "openai-completions";
			return {
				id: model.id,
				name: model.name,
				provider: providerName,
				api,
				baseUrl: model.baseUrl ?? modelBaseUrl,
				reasoning: model.reasoning,
				...(model.thinkingLevelMap
					? { thinkingLevelMap: model.thinkingLevelMap }
					: {}),
				input: model.input,
				cost: model.cost,
				contextWindow: model.contextWindow,
				maxTokens: model.maxTokens,
				...(model.headers ? { headers: model.headers } : {}),
				...(model.compat ? { compat: model.compat } : {}),
			};
		});
	const provider = createProvider<CliProxyApi>({
		id: providerName,
		name: "CLIProxyAPI",
		baseUrl,
		auth: { apiKey: createCliProxyApiAuth(baseUrl) },
		models: runtimeModels(models, baseUrl),
		async fetchModels(context) {
			if (!context.allowNetwork) return runtimeModels(models, baseUrl);
			const refreshedCredential = context.credential?.type === "api_key"
				? context.credential
				: undefined;
			const refreshedBaseUrl = credentialBaseUrl(
				refreshedCredential,
				DEFAULT_BASE_URL,
			);
			const refreshedApiKey = refreshedCredential?.key ??
				process.env[API_KEY_ENV];
			const refreshedModels = await discoverProviderModels({
				baseUrl: refreshedBaseUrl,
				...(refreshedApiKey ? { apiKey: refreshedApiKey } : {}),
				...(CLIPROXYAPI_MODELS_DEV_URL
					? { modelsDevUrl: CLIPROXYAPI_MODELS_DEV_URL }
					: {}),
				settings,
				getJson,
			});
			models = refreshedModels;
			return runtimeModels(refreshedModels, refreshedBaseUrl);
		},
		api: {
			"openai-completions": lazyApi(() =>
				import(piAiApiModuleUrl(PI_AI_ENTRYPOINT, "openai-completions"))
			),
			"openai-responses": lazyApi(() =>
				import(piAiApiModuleUrl(PI_AI_ENTRYPOINT, "openai-responses"))
			),
		},
	});
	pi.registerProvider(provider);

	registerSettingsCommand(pi, models.map((model) => model.id));
	pi.on("before_provider_request", (event, ctx) => {
		if (ctx.model?.provider !== providerName) return;
		const payload = applyFastMode(
			event.payload,
			ctx.model.id,
			settings.gptFastMode,
		);
		if (payload === event.payload) return;
		return { payload };
	});
}
