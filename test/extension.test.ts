import { expect, test } from "bun:test";
import { piAiApiModuleUrl } from "../extensions/index.ts";

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
