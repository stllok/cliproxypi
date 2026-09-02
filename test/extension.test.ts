import { expect, test } from "bun:test";
import {
	DEFAULT_PROVIDER_NAME,
	piAiApiModuleUrl,
} from "../extensions/index.ts";

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
