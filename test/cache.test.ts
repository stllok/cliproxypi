import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readModelCache, writeModelCache } from "../src/cache.ts";
import type { ProviderModel } from "../src/types.ts";

test("round-trips cached provider models", async () => {
	const directory = await mkdtemp(join(tmpdir(), "cliproxypi-cache-"));
	const path = join(directory, "models.json");
	const models = [{
		id: "cached/model",
		name: "Cached Model",
		api: "openai-completions",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 16_384,
	}] satisfies ProviderModel[];

	try {
		await writeModelCache(path, models);
		expect(await readModelCache(path)).toEqual(models);
	} finally {
		await rm(directory, { recursive: true });
	}
});
