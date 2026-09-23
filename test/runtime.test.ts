import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { writeModelCache } from "../src/cache.ts";

const { PATH, CLIPROXYPI_HOST_LOADER } = process.env;
const requestSchema = z.object({
	model: z.string(),
	messages: z.array(z.object({ role: z.string(), content: z.unknown() }))
		.optional(),
	input: z.array(z.object({ role: z.string(), content: z.unknown() }))
		.optional(),
	tools: z.array(z.object({
		name: z.string().optional(),
		function: z.object({ name: z.string() }).optional(),
	})),
});

for (const api of ["openai-completions", "openai-responses"] as const) {
	for (const key of ["runtime-test-key", ""]) {
		test(
			`loads Pi extension and streams ${api} with ${
				key ? "API key" : "keyless auth"
			}`,
			async () => {
				const agentDir = await mkdtemp(
					join(tmpdir(), "cliproxypi-runtime-"),
				);
				const requests: {
					path: string;
					authorization: string | null;
					body: z.infer<typeof requestSchema>;
				}[] = [];
				const server = Bun.serve({
					hostname: "127.0.0.1",
					port: 0,
					async fetch(request) {
						requests.push({
							path: new URL(request.url).pathname,
							authorization: request.headers.get("authorization"),
							body: requestSchema.parse(await request.json()),
						});
						const item = {
							type: "message",
							id: "msg_runtime",
							role: "assistant",
							status: "completed",
							content: [{
								type: "output_text",
								text: "runtime-ok",
								annotations: [],
							}],
						};
						const events = api === "openai-completions"
							? [
								{
									id: "chat_runtime",
									choices: [{
										index: 0,
										delta: {
											role: "assistant",
											content: "runtime-ok",
										},
										finish_reason: null,
									}],
								},
								{
									id: "chat_runtime",
									choices: [{
										index: 0,
										delta: {},
										finish_reason: "stop",
									}],
								},
							]
							: [
								{
									type: "response.created",
									response: { id: "resp_runtime" },
								},
								{
									type: "response.output_item.added",
									output_index: 0,
									item: { ...item, content: [] },
								},
								{
									type: "response.output_text.delta",
									output_index: 0,
									content_index: 0,
									delta: "runtime-ok",
								},
								{
									type: "response.output_item.done",
									output_index: 0,
									item,
								},
								{
									type: "response.completed",
									response: {
										id: "resp_runtime",
										status: "completed",
										output: [item],
										usage: {
											input_tokens: 2,
											output_tokens: 1,
											total_tokens: 3,
										},
									},
								},
							];
						return new Response(
							`${
								events.map((event) =>
									`data: ${JSON.stringify(event)}\n\n`
								).join("")
							}data: [DONE]\n\n`,
							{
								headers: {
									"content-type": "text/event-stream",
								},
							},
						);
					},
				});
				try {
					await writeModelCache(
						join(agentDir, "cliproxypi-models.json"),
						[{
							id: api,
							name: api,
							api,
							reasoning: false,
							input: ["text"],
							cost: {
								input: 0,
								output: 0,
								cacheRead: 0,
								cacheWrite: 0,
							},
							contextWindow: 128_000,
							maxTokens: 16_384,
						}],
					);
					const child = Bun.spawn([
						CLIPROXYPI_HOST_LOADER ? "bun" : "node",
						resolve("test/fixtures/pi-runtime.ts"),
						resolve("extensions/index.ts"),
						api,
					], {
						cwd: agentDir,
						env: {
							PATH,
							...(CLIPROXYPI_HOST_LOADER
								? {
									CLIPROXYPI_HOST_LOADER,
								}
								: {}),
							HOME: agentDir,
							PI_CODING_AGENT_DIR: agentDir,
							PI_OFFLINE: "1",
							CLIPROXYAPI_BASE_URL:
								`http://127.0.0.1:${server.port}/v1`,
							CLIPROXYAPI_API_KEY: key,
						},
						stdout: "pipe",
						stderr: "pipe",
					});
					const [exitCode, stdout, stderr] = await Promise.all([
						child.exited,
						new Response(child.stdout).text(),
						new Response(child.stderr).text(),
					]);
					expect({ exitCode, stderr }).toEqual({
						exitCode: 0,
						stderr: "",
					});
					expect(stdout).toContain("PI_RUNTIME_OK");
					expect(requests).toHaveLength(2);
					for (const request of requests) {
						expect(request.path).toBe(
							api === "openai-completions"
								? "/v1/chat/completions"
								: "/v1/responses",
						);
						expect(request.authorization).toBe(
							key ? `Bearer ${key}` : null,
						);
						expect(request.body.model).toBe(api);
						const messages = request.body.messages ??
							request.body.input;
						expect(messages?.[0]).toEqual({
							role: "system",
							content: "runtime-system-marker",
						});
						const tool = request.body.tools[0];
						expect(tool?.function?.name ?? tool?.name).toBe(
							"runtime_probe",
						);
					}
				} finally {
					server.stop(true);
					await rm(agentDir, { recursive: true, force: true });
				}
			},
			30_000,
		);
	}
}
