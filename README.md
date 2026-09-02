# cliproxypi

Pi/omo-ai provider extension for [CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI).

## Install and run

Install directly from GitHub:

```sh
pi install git:github.com/stllok/cliproxypi
```

Restart Pi after installation. To pin a revision, append a tag or commit:

```sh
pi install git:github.com/stllok/cliproxypi@<tag-or-commit>
```

For local development:

```sh
bun install
CLIPROXYAPI_BASE_URL=http://localhost:8317/v1 \
CLIPROXYAPI_API_KEY=your-key \
pi -e .
```

The extension awaits fresh `/v1/models` and `https://models.dev/api.json`
requests during every Pi startup, then registers only models currently exposed
by CLIProxyAPI.

Environment variables:

- `CLIPROXYAPI_BASE_URL` - defaults to `http://localhost:8317/v1`
- `CLIPROXYAPI_API_KEY` - bearer key used for discovery and inference
- `CLIPROXYAPI_PROVIDER_NAME` - defaults to `cliproxyapi`
- `CLIPROXYAPI_MODELS_DEV_URL` - optional models.dev-compatible mirror URL

## Model metadata

CLIProxyAPI model IDs remain unchanged on requests. For metadata lookup, the
extension strips route prefixes such as `gb10/` and normalizes punctuation, so
`gb10/glm5.3-flash` matches models.dev `zai/glm-5.3-flash`.

Matched metadata supplies:

- context and output limits
- input/output/cache pricing
- text and image input support
- display name and reasoning capability

Reasoning controls use the levels advertised by CLIProxyAPI through
`supported_reasoning_efforts`, `supported_reasoning_levels`,
`reasoning_efforts`, or `reasoning_levels`. Unsupported Pi levels are hidden.
Newer CLIProxyAPI builds also expose a rich
`/v1/models?client_version=pi` catalog.

## Persistent settings

Run:

```text
/cliproxyapi
```

The native settings panel writes the `cliproxypi` section in
`~/.pi/agent/settings.json` and reloads Pi after changes.

- **GPT-5.6 context policy**
  - `codex-save`: 272,000 tokens
  - `codex`: 400,000 tokens
  - `api`: 1,000,000 tokens
- **Custom model input/context tokens**: positive token count per discovered
  model; `auto` removes the override. GPT-5.6 overrides remain capped at
  1,000,000.
- **Custom model output tokens**: positive token count per discovered model;
  `auto` restores the models.dev value.
- **GPT fast mode**: persistent on/off setting. When enabled, GPT requests carry
  `service_tier: "fast"`; no `/fast` session command is needed.
- **Model thinking levels**: choose a source per model:
  - `cliproxyapi`: rich CLIProxyAPI catalog (default)
  - `api`: fields from the standard `/v1/models` response
  - `hardcoded`: known Kimi K3, Qwen 3.8, and GLM 5.3 Flash capabilities
  - `all`: force `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max`

Equivalent settings:

```json
{
  "cliproxypi": {
    "gpt56ContextPolicy": "api",
    "customContext": {
      "kimi-k3-256k": 256000
    },
    "customMaxTokens": {
      "kimi-k3-256k": 64000
    },
    "gptFastMode": true,
    "thinkingLevelSource": {
      "kimi-k3": "hardcoded",
      "local/qwen3.8-27b": "all"
    }
  }
}
```

For slow local models, Senpi's provider stream-start watchdog is configured at
the root of the same file. Ten minutes:

```json
{
  "retry": {
    "provider": {
      "streamStartTimeoutMs": 600000
    }
  }
}
```

Use `0` instead to disable the stream-start watchdog.

## Check

```sh
bun run check
```
