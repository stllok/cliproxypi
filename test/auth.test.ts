import { describe, expect, test } from "bun:test";
import { createCliProxyApiAuth } from "../src/auth.ts";

describe("CLIProxyAPI login", () => {
	test("treats the default keyless endpoint as configured", async () => {
		const auth = createCliProxyApiAuth("http://localhost:8317/v1");

		expect(
			await auth.resolve({
				ctx: {
					async env() {
						return undefined;
					},
					async fileExists() {
						return false;
					},
				},
				signal: new AbortController().signal,
			}),
		).toEqual({
			auth: { baseUrl: "http://localhost:8317/v1" },
			source: "default endpoint",
		});
	});

	test("stores and resolves endpoint with API key", async () => {
		const prompts: string[] = [];
		const answers = ["https://proxy.example/v1", "secret"];
		const auth = createCliProxyApiAuth("http://localhost:8317/v1");
		const signal = new AbortController().signal;
		const credential = await auth.login?.({
			signal,
			async prompt(input) {
				prompts.push(input.type);
				return answers.shift() ?? "";
			},
			notify() {},
		});

		expect(prompts).toEqual(["text", "secret"]);
		expect(credential).toEqual({
			type: "api_key",
			key: "secret",
			env: { CLIPROXYAPI_BASE_URL: "https://proxy.example/v1" },
		});
		if (!credential) throw new Error("Expected login credential");
		expect(
			await auth.resolve({
				ctx: {
					async env() {
						return undefined;
					},
					async fileExists() {
						return false;
					},
				},
				credential,
				signal,
			}),
		).toEqual({
			auth: {
				apiKey: "secret",
				baseUrl: "https://proxy.example/v1",
			},
			source: "stored credential",
		});
	});

	test("requests one refresh after a completed login resolves", async () => {
		let refreshes = 0;
		const auth = createCliProxyApiAuth(
			"http://localhost:8317/v1",
			() => {
				refreshes += 1;
			},
		);
		const credential = await auth.login?.({
			signal: new AbortController().signal,
			async prompt(input) {
				return input.type === "text" ? "" : "secret";
			},
			notify() {},
		});
		if (!credential) throw new Error("Expected login credential");

		expect(refreshes).toBe(0);
		await auth.resolve({
			ctx: {
				async env() {
					return undefined;
				},
				async fileExists() {
					return false;
				},
			},
			credential,
			signal: new AbortController().signal,
		});
		await auth.resolve({
			ctx: {
				async env() {
					return undefined;
				},
				async fileExists() {
					return false;
				},
			},
			credential,
			signal: new AbortController().signal,
		});

		expect(refreshes).toBe(1);
	});
});
