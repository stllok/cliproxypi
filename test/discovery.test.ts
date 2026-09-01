import { describe, expect, test } from "bun:test";
import { parseCpaModels, parseModelsDev } from "../src/discovery.ts";

describe("CPA discovery", () => {
	test("keeps model IDs and advertised reasoning levels", () => {
		const models = parseCpaModels({
			data: [
				{
					id: "gb10/glm5.3-flash",
					owned_by: "gb10",
					supported_reasoning_efforts: ["low", "high"],
				},
			],
		});

		expect(models).toEqual([
			{
				id: "gb10/glm5.3-flash",
				ownedBy: "gb10",
				reasoningLevels: ["low", "high"],
			},
		]);
	});

	test("parses provider-qualified models.dev metadata", () => {
		const models = parseModelsDev({
			zai: {
				models: {
					"glm-5.3-flash": {
						id: "glm-5.3-flash",
						name: "GLM 5.3 Flash",
						reasoning: true,
						modalities: {
							input: ["text", "image"],
							output: ["text"],
						},
						limit: { context: 202_752, output: 65_536 },
						cost: { input: 0.2, output: 1.1, cache_read: 0.02 },
					},
				},
			},
		});

		expect(models[0]).toEqual({
			id: "glm-5.3-flash",
			provider: "zai",
			name: "GLM 5.3 Flash",
			reasoning: true,
			input: ["text", "image"],
			contextWindow: 202_752,
			maxTokens: 65_536,
			cost: { input: 0.2, output: 1.1, cacheRead: 0.02, cacheWrite: 0 },
		});
	});
});
