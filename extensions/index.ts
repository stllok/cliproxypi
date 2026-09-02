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
	convertKimiSystemMessageToUser,
	discoverProviderModels,
	type JsonGetter,
} from "../src/provider.ts";
import { readModelCache, writeModelCache } from "../src/cache.ts";
import { registerSettingsCommand } from "../src/settings-command.ts";
import { loadProviderSettings } from "../src/settings.ts";
import type { CliProxyApi, ProviderModel } from "../src/types.ts";

const DEFAULT_BASE_URL = "http://localhost:8317/v1";
export const DEFAULT_PROVIDER_NAME = "cliproxypi";
const PI_AI_ENTRYPOINT = import.meta.resolve("@earendil-works/pi-ai");

export function piAiApiModuleUrl(
	entrypoint: string,
	api: CliProxyApi,
): string {
	return new URL(`./api/${api}.js`, entrypoint).href;
}

const getJson: JsonGetter = async (url, headers) =>
	ky.get(url, {
		headers,
		retry: 0,
		timeout: 60_000,
	}).json<unknown>();

type RegistrationOptions = {
	readonly cachePath?: string;
	readonly getJson?: JsonGetter;
	readonly refreshBeforeRegistration?: boolean;
};

export async function registerCliProxyApi(
	pi: ExtensionAPI,
	options: RegistrationOptions = {},
): Promise<void> {
	const {
		CLIPROXYAPI_PROVIDER_NAME,
		CLIPROXYAPI_MODELS_DEV_URL,
		PI_OFFLINE,
	} = process.env;
	const providerName = CLIPROXYAPI_PROVIDER_NAME?.trim() ||
		DEFAULT_PROVIDER_NAME;
	const stored = readStoredCredential(providerName);
	const credential = stored?.type === "api_key" ? stored : undefined;
	const baseUrl = credentialBaseUrl(credential, DEFAULT_BASE_URL);
	const settings = loadProviderSettings(join(getAgentDir(), "settings.json"));
	const cachePath = options.cachePath ??
		join(getAgentDir(), "cliproxypi-models.json");
	const jsonGetter = options.getJson ?? getJson;
	let models = await readModelCache(cachePath);
	let refreshGeneration = 0;

	const runtimeModels = (
		items: readonly ProviderModel[],
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
	const register = (): void => {
		pi.registerProvider(createProvider<CliProxyApi>({
			id: providerName,
			name: "CLIProxyAPI",
			baseUrl,
			auth: {
				apiKey: createCliProxyApiAuth(baseUrl, (completedLogin) => {
					refreshInBackground(completedLogin);
				}),
			},
			models: runtimeModels(models, baseUrl),
			api: {
				"openai-completions": lazyApi(() =>
					import(
						piAiApiModuleUrl(PI_AI_ENTRYPOINT, "openai-completions")
					)
				),
				"openai-responses": lazyApi(() =>
					import(
						piAiApiModuleUrl(PI_AI_ENTRYPOINT, "openai-responses")
					)
				),
			},
		}));
	};
	const discover = async (
		currentCredential: ApiKeyCredential | undefined,
	): Promise<ProviderModel[]> => {
		const currentBaseUrl = credentialBaseUrl(
			currentCredential,
			DEFAULT_BASE_URL,
		);
		const currentApiKey = currentCredential?.key ??
			process.env[API_KEY_ENV];
		const discovered = await discoverProviderModels({
			baseUrl: currentBaseUrl,
			...(currentApiKey ? { apiKey: currentApiKey } : {}),
			...(CLIPROXYAPI_MODELS_DEV_URL
				? { modelsDevUrl: CLIPROXYAPI_MODELS_DEV_URL }
				: {}),
			settings,
			getJson: jsonGetter,
		});
		return discovered;
	};
	const refresh = async (
		currentCredential: ApiKeyCredential | undefined = credential,
	): Promise<void> => {
		const generation = ++refreshGeneration;
		const discovered = await discover(currentCredential);
		if (generation !== refreshGeneration || discovered.length === 0) return;
		// ponytail: preserve a non-empty cache on transient failures; add an
		// explicit discovery status if intentionally empty catalogs matter.
		await writeModelCache(cachePath, discovered);
		if (generation !== refreshGeneration) return;
		models = discovered;
		register();
	};
	const refreshInBackground = (
		currentCredential?: ApiKeyCredential,
	): void => {
		void refresh(currentCredential).catch((error: unknown) => {
			console.warn(
				`[cliproxypi] model refresh failed: ${
					error instanceof Error ? error.message : String(error)
				}`,
			);
		});
	};
	const refreshBeforeRegistration = options.refreshBeforeRegistration ??
		(process.argv.includes("--list-models") &&
			PI_OFFLINE === undefined);
	if (refreshBeforeRegistration) await refresh();
	register();

	registerSettingsCommand(pi, providerName);
	pi.on("session_start", () => {
		refreshInBackground();
	});
	pi.on("before_provider_request", (event, ctx) => {
		if (ctx.model?.provider !== providerName) return;
		const payload = applyFastMode(
			event.payload,
			ctx.model.id,
			settings.gptFastMode,
		);
		const compatiblePayload = convertKimiSystemMessageToUser(
			payload,
			ctx.model.id,
		);
		if (compatiblePayload === event.payload) return;
		return { payload: compatiblePayload };
	});
}

export default registerCliProxyApi;
