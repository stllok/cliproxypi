import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import type { ProviderModel } from "./types.ts";

const modelSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	api: z.enum(["openai-completions", "openai-responses"]).optional(),
	compact: z.object({
		supportDeveloperRole: z.boolean().optional(),
	}).passthrough().optional(),
	reasoning: z.boolean(),
	thinkingLevelMap: z.record(z.string(), z.string().nullable()).optional(),
	input: z.array(z.enum(["text", "image"])),
	cost: z.object({
		input: z.number(),
		output: z.number(),
		cacheRead: z.number(),
		cacheWrite: z.number(),
	}),
	contextWindow: z.number().int().positive(),
	maxTokens: z.number().int().positive(),
});
const cacheSchema = z.array(modelSchema);

export async function readModelCache(path: string): Promise<ProviderModel[]> {
	try {
		return cacheSchema.parse(JSON.parse(await readFile(path, "utf8")))
			.map(({ api, thinkingLevelMap, ...model }) => ({
				...model,
				...(api ? { api } : {}),
				...(thinkingLevelMap ? { thinkingLevelMap } : {}),
			}));
	} catch (error) {
		if (
			error && typeof error === "object" && "code" in error &&
			error.code === "ENOENT"
		) {
			return [];
		}
		console.warn(
			`[cliproxypi] ignored invalid model cache: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return [];
	}
}

export async function writeModelCache(
	path: string,
	models: readonly ProviderModel[],
): Promise<void> {
	await writeFile(path, `${JSON.stringify(models, null, 2)}\n`, {
		mode: 0o600,
	});
}
