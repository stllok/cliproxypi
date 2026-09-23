import assert from "node:assert/strict";
import {
	discoverAndLoadExtensions,
	ModelRegistry,
	ModelRuntime,
} from "@earendil-works/pi-coding-agent";
import {
	type AssistantMessageEventStream,
	contentText,
	InMemoryCredentialStore,
	Type,
} from "@earendil-works/pi-ai";

const [extensionPath, modelId] = process.argv.slice(2);
assert.ok(extensionPath);
assert.ok(modelId);
const { CLIPROXYPI_HOST_LOADER } = process.env;
// Use the host's registry as well as its loader. Mixing a host loader with
// the local registry hides context-contract mismatches at the provider boundary.
const host = CLIPROXYPI_HOST_LOADER
	? await import(CLIPROXYPI_HOST_LOADER)
	: { discoverAndLoadExtensions, ModelRegistry, ModelRuntime };
const loaded = await host.discoverAndLoadExtensions(
	[extensionPath],
	process.cwd(),
);
assert.deepEqual(loaded.errors, []);
assert.equal(loaded.extensions.length, 1);
assert.equal(loaded.runtime.pendingNativeProviderRegistrations.length, 1);
const runtime = await host.ModelRuntime.create({
	credentials: new InMemoryCredentialStore(),
	modelsPath: null,
	refreshOnCreate: false,
});
const registry = new host.ModelRegistry(runtime);
for (const { provider } of loaded.runtime.pendingNativeProviderRegistrations) {
	registry.registerProvider(provider);
}
const model = registry.find("cliproxypi", modelId);
assert.ok(model);
const context = {
	systemPrompt: "runtime-system-marker",
	messages: [{ role: "user", content: "runtime-user-marker", timestamp: 1 }],
	tools: [{
		name: "runtime_probe",
		description: "Return a numeric value",
		parameters: Type.Object({ value: Type.Number() }),
	}],
} satisfies Parameters<typeof registry.streamSimple>[1];
for (const method of ["stream", "streamSimple"] as const) {
	const events: AssistantMessageEventStream = registry[method](
		model,
		context,
		{
			signal: AbortSignal.timeout(10_000),
		},
	);
	const eventTypes: string[] = [];
	for await (const event of events) eventTypes.push(event.type);
	const result = await events.result();
	assert.equal(
		result.stopReason,
		"stop",
		result.errorMessage ?? "Expected completed stream",
	);
	assert.equal(contentText(result.content), "runtime-ok");
	assert.equal(eventTypes[0], "start");
	assert.equal(eventTypes.at(-1), "done");
	assert.ok(eventTypes.includes("text_delta"));
}
console.log("PI_RUNTIME_OK");
