import type {
	ApiKeyAuth,
	ApiKeyCredential,
	ProviderEnv,
} from "@earendil-works/pi-ai";

export const BASE_URL_ENV = "CLIPROXYAPI_BASE_URL";
export const API_KEY_ENV = "CLIPROXYAPI_API_KEY";

function endpoint(value: string, fallback: string): string {
	const resolved = value.trim() || fallback;
	const url = new URL(resolved);
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error("CLIProxyAPI endpoint must use http:// or https://");
	}
	return resolved.replace(/\/+$/, "");
}

export function credentialBaseUrl(
	credential: ApiKeyCredential | undefined,
	fallback: string,
	configured = process.env[BASE_URL_ENV],
): string {
	return endpoint(
		credential?.env?.[BASE_URL_ENV] ?? configured ?? "",
		fallback,
	);
}

export function createCliProxyApiAuth(defaultBaseUrl: string): ApiKeyAuth {
	return {
		name: "CLIProxyAPI endpoint and API key",
		async login({ prompt }) {
			const baseUrl = endpoint(
				await prompt({
					type: "text",
					message: "CLIProxyAPI endpoint",
					placeholder: defaultBaseUrl,
				}),
				defaultBaseUrl,
			);
			const key = (
				await prompt({
					type: "secret",
					message: "CLIProxyAPI API key (optional)",
				})
			).trim();
			const env: ProviderEnv = { [BASE_URL_ENV]: baseUrl };
			return {
				type: "api_key",
				...(key ? { key } : {}),
				env,
			};
		},
		async resolve({ ctx, credential }) {
			const configuredBaseUrl = await ctx.env(BASE_URL_ENV);
			const configuredApiKey = await ctx.env(API_KEY_ENV);
			if (!credential && !configuredBaseUrl && !configuredApiKey) {
				return undefined;
			}

			const baseUrl = credentialBaseUrl(
				credential,
				defaultBaseUrl,
				configuredBaseUrl,
			);
			const apiKey = credential?.key ?? configuredApiKey;
			return {
				auth: {
					...(apiKey ? { apiKey } : {}),
					baseUrl,
				},
				source: credential
					? "stored credential"
					: configuredApiKey
					? API_KEY_ENV
					: BASE_URL_ENV,
			};
		},
	};
}
