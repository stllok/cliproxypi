import { describe, expect, test } from "bun:test";
import { buildProviderModel } from "../src/models.ts";
import { DEFAULT_SETTINGS } from "../src/settings.ts";

describe("shared GPT context policy", () => {
	for (
		const id of [
			"gpt-5.6-sol",
			"gpt-6",
			"gpt-6-astra",
			"gpt-6-mini",
			"openai/GPT_6_PRO",
			"gpt6-codex",
		]
	) {
		test(`${id} uses every configured profile`, () => {
			for (
				const [policy, expected] of [
					["codex-save", 272_000],
					["codex", 400_000],
					["api", 1_000_000],
				] as const
			) {
				expect(
					buildProviderModel({ id, reasoningLevels: [] }, undefined, {
						...DEFAULT_SETTINGS,
						gpt56ContextPolicy: policy,
					}).contextWindow,
				).toBe(expected);
			}
		});

		test(`${id} honors custom context up to the shared cap`, () => {
			for (
				const [custom, expected] of [[900_000, 900_000], [
					2_000_000,
					1_000_000,
				]] as const
			) {
				expect(
					buildProviderModel({ id, reasoningLevels: [] }, undefined, {
						...DEFAULT_SETTINGS,
						customContext: { [id]: custom },
					}).contextWindow,
				).toBe(expected);
			}
		});
	}

	test("other model families retain their fallback context", () => {
		for (const id of ["gpt-5.5", "gpt-7", "claude-sonnet"]) {
			expect(
				buildProviderModel(
					{ id, reasoningLevels: [] },
					undefined,
					DEFAULT_SETTINGS,
				).contextWindow,
			)
				.toBe(128_000);
		}
	});
});
