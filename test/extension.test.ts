import { expect, test } from "bun:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { Provider } from "@earendil-works/pi-ai";
import {
	DEFAULT_PROVIDER_NAME,
	piAiApiModuleUrl,
	registerCliProxyApi,
} from "../extensions/index.ts";
import packageJson from "../package.json" with { type: "json" };
import { writeModelCache } from "../src/cache.ts";
import type { ProviderModel } from "../src/types.ts";

test("uses cliproxypi as the provider credential key", () => {
	expect(DEFAULT_PROVIDER_NAME).toBe("cliproxypi");
});

test("resolves API module beside a compatibility entrypoint", () => {
	expect(
		piAiApiModuleUrl(
			"file:///opt/senpi/node_modules/@earendil-works/pi-ai/dist/compat.js",
			"openai-completions",
		),
	).toBe(
		"file:///opt/senpi/node_modules/@earendil-works/pi-ai/dist/api/openai-completions.js",
	);
});

test("declares Pi runtime packages as required host peers", () => {
	expect(packageJson.peerDependencies).toEqual({
		"@earendil-works/pi-ai": "*",
		"@earendil-works/pi-coding-agent": "*",
	});
	expect("peerDependenciesMeta" in packageJson).toBe(false);
});

test("restores cached models before refreshing in background", async () => {
	let provider: Provider | undefined;
	let sessionStart: ((event: unknown, ctx: unknown) => void) | undefined;
	const refreshed = Promise.withResolvers<void>();
	let registrations = 0;
	const pi = {
		registerProvider(value: Provider) {
			provider = value;
			registrations += 1;
			if (registrations === 2) refreshed.resolve();
		},
		registerCommand() {},
		on(event: string, handler: (event: unknown, ctx: unknown) => void) {
			if (event === "session_start") sessionStart = handler;
		},
	} as unknown as ExtensionAPI;
	const cachePath = `/tmp/cliproxypi-extension-${crypto.randomUUID()}.json`;
	const cached = [{
		id: "cached/model",
		name: "Cached Model",
		api: "openai-completions",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_384,
	}] satisfies ProviderModel[];
	await writeModelCache(cachePath, cached);

	await registerCliProxyApi(pi, {
		cachePath,
		async getJson(url) {
			return url.endsWith("/models")
				? { data: [{ id: "fresh/model" }] }
				: {};
		},
	});
	expect(provider?.getModels().map((model) => model.id)).toEqual([
		"cached/model",
	]);
	if (!sessionStart) throw new Error("Expected session_start handler");
	sessionStart(
		{ type: "session_start", reason: "startup" },
		{ modelRegistry: {} },
	);
	await refreshed.promise;
	expect(provider?.getModels().map((model) => model.id)).toEqual([
		"fresh/model",
	]);
});

test("refreshes before registration for model-list consumers", async () => {
	let provider: Provider | undefined;
	const pi = {
		registerProvider(value: Provider) {
			provider = value;
		},
		registerCommand() {},
		on() {},
	} as unknown as ExtensionAPI;

	await registerCliProxyApi(
		pi,
		{
			cachePath: `/tmp/cliproxypi-list-${crypto.randomUUID()}.json`,
			refreshBeforeRegistration: true,
			async getJson(url) {
				return url.endsWith("/models")
					? { data: [{ id: "multica-visible-model" }] }
					: {};
			},
		},
	);

	expect(provider?.getModels().map((model) => model.id)).toEqual([
		"multica-visible-model",
	]);
});
