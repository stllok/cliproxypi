import { z } from "zod";
import {
	type CpaModel,
	type ModelsDevModel,
	THINKING_LEVELS,
	type ThinkingLevel,
} from "./types.ts";

const cpaModelSchema = z
	.object({
		id: z.string().trim().min(1),
		owned_by: z.string().optional(),
		reasoning_levels: z.array(z.string()).optional(),
		reasoning_efforts: z.array(z.string()).optional(),
		supported_reasoning_levels: z.array(z.string()).optional(),
		supported_reasoning_efforts: z.array(z.string()).optional(),
	})
	.passthrough();

const cpaResponseSchema = z.object({ data: z.array(cpaModelSchema) });
const cpaThinkingLevelSchema = z.union([
	z.string(),
	z.object({ effort: z.string() }).passthrough(),
]);
const cpaThinkingModelSchema = z
	.object({
		slug: z.string().optional(),
		id: z.string().optional(),
		supported_reasoning_levels: z.array(cpaThinkingLevelSchema).optional(),
	})
	.passthrough();
const cpaThinkingResponseSchema = z.object({
	models: z.array(cpaThinkingModelSchema),
});

const metadataSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().optional(),
		reasoning: z.boolean().optional(),
		modalities: z.object({ input: z.array(z.string()).optional() })
			.optional(),
		limit: z
			.object({
				context: z.number().int().nonnegative().optional(),
				output: z.number().int().nonnegative().optional(),
			})
			.optional(),
		cost: z
			.object({
				input: z.number().nonnegative().optional(),
				output: z.number().nonnegative().optional(),
				cache_read: z.number().nonnegative().optional(),
				cache_write: z.number().nonnegative().optional(),
			})
			.optional(),
	})
	.passthrough();

const providerSchema = z.object({
	models: z.record(z.string(), metadataSchema),
}).passthrough();
const modelsDevSchema = z.record(z.string(), providerSchema);

function reasoningLevels(
	record: z.infer<typeof cpaModelSchema>,
): ThinkingLevel[] {
	const advertised = record.supported_reasoning_efforts ??
		record.supported_reasoning_levels ??
		record.reasoning_efforts ??
		record.reasoning_levels ??
		[];
	return normalizeReasoningLevels(advertised);
}

function normalizeReasoningLevels(
	advertised: readonly string[],
): ThinkingLevel[] {
	const allowed = new Set<string>(THINKING_LEVELS);
	return [
		...new Set(
			advertised
				.map((level) =>
					level.toLowerCase() === "none" ? "off" : level.toLowerCase()
				)
				.filter((level): level is ThinkingLevel => allowed.has(level)),
		),
	];
}

export function parseCpaThinkingLevels(
	payload: unknown,
): Readonly<Record<string, readonly ThinkingLevel[]>> {
	const parsed = cpaThinkingResponseSchema.parse(payload);
	return Object.fromEntries(parsed.models.flatMap((model) => {
		const id = model.slug ?? model.id;
		if (!id) return [];
		const advertised = (model.supported_reasoning_levels ?? []).map(
			(level) => typeof level === "string" ? level : level.effort,
		);
		return [[id, normalizeReasoningLevels(advertised)]];
	}));
}

export function parseCpaModels(payload: unknown): CpaModel[] {
	const parsed = cpaResponseSchema.parse(payload);
	const unique = new Map<string, CpaModel>();
	for (const model of parsed.data) {
		unique.set(model.id, {
			id: model.id,
			...(model.owned_by ? { ownedBy: model.owned_by } : {}),
			reasoningLevels: reasoningLevels(model),
		});
	}
	return [...unique.values()].sort((left, right) =>
		left.id.localeCompare(right.id)
	);
}

export function parseModelsDev(payload: unknown): ModelsDevModel[] {
	const parsed = modelsDevSchema.parse(payload);
	return Object.entries(parsed).flatMap(([provider, entry]) =>
		Object.values(entry.models).map((model) => ({
			id: model.id,
			provider,
			...(model.name ? { name: model.name } : {}),
			...(model.reasoning !== undefined
				? { reasoning: model.reasoning }
				: {}),
			input: model.modalities?.input ?? ["text"],
			...(model.limit?.context
				? { contextWindow: model.limit.context }
				: {}),
			...(model.limit?.output ? { maxTokens: model.limit.output } : {}),
			cost: {
				input: model.cost?.input ?? 0,
				output: model.cost?.output ?? 0,
				cacheRead: model.cost?.cache_read ?? 0,
				cacheWrite: model.cost?.cache_write ?? 0,
			},
		}))
	);
}
