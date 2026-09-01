import {
	type ExtensionAPI,
	getAgentDir,
	readStoredCredential,
} from "@earendil-works/pi-coding-agent";
import ky from "ky";
import { join } from "node:path";
import {
	applyFastMode,
	discoverProviderModels,
	type JsonGetter,
} from "../src/provider.ts";
import { registerSettingsCommand } from "../src/settings-command.ts";
import { loadProviderSettings } from "../src/settings.ts";

const DEFAULT_BASE_URL = "http://localhost:8317/v1";
const DEFAULT_PROVIDER_NAME = "cliproxyapi";

function storedApiKey(providerName: string): string | undefined {
	const credential = readStoredCredential(providerName);
	return credential?.type === "api_key" ? credential.key : undefined;
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
		CLIPROXYAPI_BASE_URL,
		CLIPROXYAPI_API_KEY,
		CLIPROXYAPI_MODELS_DEV_URL,
	} = process.env;
	const providerName = CLIPROXYAPI_PROVIDER_NAME?.trim() ||
		DEFAULT_PROVIDER_NAME;
	const baseUrl = CLIPROXYAPI_BASE_URL?.trim() ||
		DEFAULT_BASE_URL;
	const apiKey = CLIPROXYAPI_API_KEY ||
		storedApiKey(providerName);
	const settings = loadProviderSettings(join(getAgentDir(), "settings.json"));
	const models = await discoverProviderModels({
		baseUrl,
		...(apiKey ? { apiKey } : {}),
		...(CLIPROXYAPI_MODELS_DEV_URL
			? { modelsDevUrl: CLIPROXYAPI_MODELS_DEV_URL }
			: {}),
		settings,
		getJson,
	});

	pi.registerProvider(providerName, {
		name: "CLIProxyAPI",
		baseUrl,
		apiKey: apiKey ?? "$CLIPROXYAPI_API_KEY",
		authHeader: true,
		api: "openai-completions",
		models,
	});

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
