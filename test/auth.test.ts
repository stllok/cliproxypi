import { describe, expect, test } from "bun:test";
import { createCliProxyApiAuth } from "../src/auth.ts";

describe("CLIProxyAPI login", () => {
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
});
