# Boomi EmbedKit — Transformation Editor

The **Transformation Editor** lets your users create and edit Boomi **Map Extension transformations** — custom JavaScript scripting functions with typed inputs and outputs — directly inside the embedded Mapping experience. It can optionally **generate the script from a natural-language prompt** using AI — either **OpenAI** or one of your own **Boomi Agent Studio** agents — with strict guardrails that keep generation scoped to data transformations only.

- 📚 Full Boomi platform docs: **[Boomi Product Documentation](https://help.boomi.com/)**
- 🤖 Enabling AI Transformation (Boomi Developer Portal): **[Enabling AI Transformation](https://developer.boomi.com/docs/BoomiEmbedded/EmbedKit/enabling_ai_transformation)**
- 🔧 Configuration tokens & options: **[Configuration Reference](./ConfigurationReference.md)**
- 🚀 First-time setup: **[Getting Started](./GettingStarted.md)**

---

## Table of Contents

1. [What it is](#1-what-it-is)
2. [Where it appears](#2-where-it-appears)
3. [The editor UI](#3-the-editor-ui)
4. [Enabling AI generation](#4-enabling-ai-generation)
5. [AI generation & guardrails](#5-ai-generation--guardrails)
6. [Data flow (end-to-end)](#6-data-flow-end-to-end)
7. [API reference](#7-api-reference)
8. [Data shapes](#8-data-shapes)
9. [Theming](#9-theming)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. What it is

A Boomi **Map Extension** can carry user-defined functions that transform field values during a map. The Transformation Editor is the EmbedKit UI for authoring one of these functions. Each transformation has:

- a **name**,
- one or more **inputs**, each with a `key`, a `name` (camelCase), and a **data type** — one of `CHARACTER`, `DATETIME`, `FLOAT`, `INTEGER`,
- one or more **outputs**, each with a `key` and a `name`,
- a **script** — JavaScript that reads the inputs and assigns the result to a variable named after the output.

The editor is a self-contained modal. Saving it persists the function to Boomi via the Map Extension update API; AI generation (when enabled) fills in the script, inputs, and outputs from a prompt.

> **Script convention:** the final result must be assigned to a bare variable whose name matches the output name — e.g. `fullName = firstName + " " + lastName;` — **not** declared with `let`/`const`/`var`. This matches Boomi's Map Extension scripting runtime.

---

## 2. Where it appears

The editor is reached from the **Mapping canvas** of an integration/agent:

```
Mapping canvas (FieldMappingCanvas / tree view)
   └── "Add Transformation"  / per-function "Edit Transformation" menu
         └── opens the "Transformation Editor" modal  (UpdateMaps)
               └── EditTransformationsForm
```

- The **Add Transformation** control and the per-function **Edit Transformation** / **Delete Transformation** menu live on the mapping canvas.
- Selecting either opens the **Transformation Editor** modal with the form prefilled (empty for *Add*, existing values for *Edit*).
- Clicking **Save** validates the form and writes the function back to the map.

The Mapping component renders in tree mode or canvas mode depending on the per-component `mapping.useTreeMode` setting (see [Configuration Reference → Component Configuration](./ConfigurationReference.md#5-component-configuration)).

---

## 3. The editor UI

| Section | What it does |
|---------|--------------|
| **Name** | Identifier for the transformation function. |
| **Inputs** | Add/remove inputs. Each input has a `name` (camelCase, no spaces) and a **data type** (`CHARACTER`, `DATETIME`, `FLOAT`, `INTEGER`). Keys are assigned automatically (1, 2, 3 …). |
| **Outputs** | Add/remove outputs. Each output has a `name`. The name **must not** be literally `output`. |
| **Transformation Script** | A JavaScript editor (Ace) with syntax highlighting and line numbers. The editor theme follows `boomiConfig.theme.darkModeTheme`. |
| **Test** | Enter sample input values and run the script in an isolated browser sandbox to preview the output (or see an error) **without** saving or calling the server. |
| **Generate (AI)** | *Only shown when `enableAi` is `true`.* Describe the transformation in plain language and the script + inputs + outputs are generated for you. See [§4](#4-enabling-ai-generation). |

### Local test runner

The **Test** action executes the script **client-side**, inside a hidden, `sandbox="allow-scripts"` iframe, communicating via `postMessage`:

- Input values are coerced by their data type (`FLOAT` → `parseFloat`, `INTEGER` → `parseInt`, `DATETIME` → `Date`, otherwise string).
- On success the iframe returns the output value(s); on a thrown error it returns the error message (shown as a *Test Error*).
- **Nothing is sent to the server or to Boomi during a test** — it is a safe, local preview only.

### Validation on save

Saving runs these checks before the function is written back to the map:

- the **script is not empty**,
- at least one **output** is present,
- no output is named the literal `output`.

If any check fails, the modal stays open and the offending field is flagged.

---

## 4. Enabling AI generation

> See the Boomi Developer Portal guide **[Enabling AI Transformation](https://developer.boomi.com/docs/BoomiEmbedded/EmbedKit/enabling_ai_transformation)** for the platform-side setup (provisioning the AI credentials for your account).

AI generation is gated in **two** places and requires **both** to be satisfied:

### Client — `boomi.config.js`

```js
export default {
  enableAi: true,   // shows the "Generate" panel in the Transformation Editor
  // ...
};
```

When `enableAi` is `false` (the default), the editor still works fully for manual authoring — only the AI **Generate** panel is hidden.

### Server — AI provider supplied at auth time

The EmbedKit server only honors a generation request when the resolved tenant credentials include an enabled `ai` block. This block is part of the credentials your server posts during the EmbedKit auth/session exchange (`POST /api/v1/auth/login`) and is stored per tenant. **Two providers are supported**, selected with `ai.model`.

#### OpenAI (default)

```ts
creds.ai = {
  enabled: true,
  model:  'gpt-4o-2024-08-06',   // any OpenAI model your account supports
  apiKey: '<OpenAI API key>',
}
```

> The OpenAI key is **per-tenant** and lives only on the EmbedKit server side — it is never shipped to the browser.

#### Boomi Agent Studio

Generate the transformation with one of your own **Boomi Agent Studio** agents instead of OpenAI. The call is authenticated with the tenant's **existing Boomi platform token** — no OpenAI key required.

```js
ai: {
  enabled: true,
  model: 'boomi-agent-studio',
  boomiAgentId: '<your Agent Studio agent id>',
  sessionType: 'single',          // one-shot request (only mode supported today)
}
```

A complete working example lives in **`index.js`** at the EmbedKit repo root, inside the `LOGIN_BODY` posted to `/api/v1/auth/login`:

```js
const LOGIN_BODY = {
  url:             'https://api.boomi.com/api/rest/v1',
  parentAccountId: '<parent account id>',
  apiUserName:     '<api user>',
  apiToken:        '<api token>',
  ai: {
    enabled: true,
    model: 'boomi-agent-studio',
    boomiAgentId: '<your Agent Studio agent id>',
    sessionType: 'single',
  },
};
```

**Agent requirements.** The agent must run in **structured mode**. EmbedKit sends the user's prompt as JSON — `{ "userPrompt": "<description>" }` — and expects the agent to return the transformation as OpenAI-style structured JSON:

```json
{ "isTransformation": true, "refusalReason": null, "name": "...", "script": "...",
  "inputs":  [{ "key": "1", "name": "...", "dataType": "CHARACTER" }],
  "outputs": [{ "key": "1", "name": "..." }] }
```

The server validates that output against the same schema the OpenAI path uses, then runs the identical guardrails ([§5](#5-ai-generation--guardrails)) and returns the same `TransformationStructuredOutput`. If the agent declines with prose instead of structured output, EmbedKit surfaces a clean **422**.

> **Required fields per provider:** `enabled` + `model` are always required; **OpenAI** also needs `apiKey`; **Boomi Agent Studio** also needs `boomiAgentId`. If a required field is missing, the endpoint returns an error explaining the feature is not enabled for the account.

---

## 5. AI generation & guardrails

When a user clicks **Generate**, the prompt is sent to the EmbedKit server, which calls OpenAI with a strict, single-purpose system prompt and returns a structured transformation. The generation is **hardened** so it cannot be repurposed:

**Scope lock & prompt-injection defense**
- The model is constrained to do exactly one thing: turn a field-transformation description into a Map Extension scripting function.
- The user's prompt is treated as **untrusted data** (wrapped in delimiters) — embedded instructions like "ignore previous instructions", role-play, or requests for anything other than a transformation are ignored.
- Prompts are capped at **2000 characters**.

**Structured refusal**
- If the request is not a legitimate field transformation, the model flags it and the server responds with **HTTP 422** and the message:
  *"This assistant only generates data transformation scripts. Please describe the field transformation you need."*

**Output safety denylist (defense in depth)**
- Even a generated script is scanned and **rejected (HTTP 422)** if it references any of: module loading (`require`/`import`/`module`), dynamic evaluation (`eval`/`Function`), host environment (`process`/`globalThis`/`global`/`window`/`self`), network (`fetch`/`XMLHttpRequest`/`WebSocket`/`navigator`), process/file I/O (`child_process`/`exec`/`fs`/…), timers (`setTimeout`/`setInterval`/…), prototype/sandbox-escape (`__proto__`/`constructor`), or alternate runtimes (`Deno`/`Bun`).
- The rejection message asks the user to refine the description to a pure data transformation.

On success, the editor is populated with the generated **script**, **inputs** (with data types), and **outputs**, which the user can review, test, and edit before saving.

---

## 6. Data flow (end-to-end)

```
┌─────────────────────────── Browser (embedkit) ──────────────────────────┐
│  Mapping canvas → "Add/Edit Transformation"                             │
│        │                                                                │
│        ▼                                                                │
│  Transformation Editor (EditTransformationsForm)                        │
│        │   ├── Test ─────────────► sandboxed iframe (local only)        │
│        │   └── Generate ──┐                                             │
│        ▼                  │                                             │
│  Save (validate) ─────────┼───────────────┐                             │
└───────────────────────────┼───────────────┼─────────────────────────────┘
                            │ POST          │ POST
                            ▼               ▼
        /api/v1/ai/build-transformation   /api/v1/map-extensions/update
                            │               │
                            ▼               ▼
                    OpenAI (per-tenant   Boomi Platform API
                    key, guardrails)     (Environment Map Extension)
```

1. **Open** the editor from the mapping canvas.
2. *(Optional)* **Generate** → `POST /api/v1/ai/build-transformation` → OpenAI → structured transformation back into the form.
3. **Test** locally in the sandbox (no network).
4. **Save** → the function is merged into the map and persisted via `POST /api/v1/map-extensions/update` → Boomi.

---

## 7. API reference

All routes are mounted under `/api/v1` and require a valid EmbedKit access token (`Authorization: Bearer <token>`).

### `POST /api/v1/ai/build-transformation`

Generate a transformation from a natural-language prompt.

**Request body**

```json
{
  "id": "custom_scripting_1718500000000",
  "userPrompt": "Combine firstName and lastName into a single fullName field"
}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Required. Identifier to assign to the generated function. |
| `userPrompt` | string | Required. 1–2000 characters. Treated as untrusted data. |

**Responses**

| Status | Meaning |
|--------|---------|
| `200` | Returns a [`TransformationStructuredOutput`](#8-data-shapes). |
| `400` | Invalid request body (schema validation). |
| `422` | Out-of-scope request (model refusal) **or** generated script failed the safety denylist. |
| `4xx/5xx` | AI not enabled for the account, or an upstream error. |

### `POST /api/v1/map-extensions/update`

Persist a map (including its transformation functions) to Boomi.

**Request body**

```json
{ "mapExtension": { /* EnvironmentMapExtension with updated ExtendedFunctions */ } }
```

Returns the updated `EnvironmentMapExtension` (`200`).

### `POST /api/v1/map-extensions/compile-function`

Compiles a platform-defined extended map function into a Custom Scripting equivalent. Used by the opt-in `updateMaps.convertFunctionsToScript` flow (see § 11). Requires `@boomi/embedkit-sdk` ≥ 1.4.0 on the server.

```json
{ "function": { "id": "FUNCEXT--0000000002", "type": "UserDefined", "Inputs": {}, "Outputs": {}, "Configuration": { "UserDefinedFunction": { "id": "…", "version": 1 } } } }
```

Response `200`: `{ language: 'Javascript', script, inputs: [{ key, name, dataType }], outputs: [{ key, name }], warnings: string[] }`. `422`: the type is not convertible.

### Related Map Extension routes

| Route | Purpose |
|-------|---------|
| `GET  /api/v1/map-extensions` | Fetch the maps for an integration pack instance / environment. |
| `POST /api/v1/map-extensions/update` | Update a single map extension (used on **Save**). |
| `POST /api/v1/map-extensions/browse` | Execute a map function browse. |
| `POST /api/v1/map-extensions/dynamic-browse` | Dynamic browse for candidate fields. |

---

## 8. Data shapes

### `TransformationStructuredOutput`

The shape returned by `build-transformation` and merged into the map on save:

```ts
{
  id: string;
  type: 'CUSTOM_SCRIPTING';
  cacheType: 'NONE';
  Inputs:  { Input:  { key: string;  name: string }[] };
  Outputs: { Output: { key: string;  name: string }[] };
  Configuration: {
    Scripting: {
      language: 'JAVASCRIPT';
      Script: string;
      Inputs:  { Input:  { index: string; name: string; dataType: 'CHARACTER' | 'DATETIME' | 'FLOAT' | 'INTEGER' }[] };
      Outputs: { Output: { index: string; name: string }[] };
    };
  };
}
```

### Input data types

| Type | Use for |
|------|---------|
| `CHARACTER` | Text / string values. |
| `DATETIME` | Date and time values. |
| `FLOAT` | Decimal numbers. |
| `INTEGER` | Whole numbers. |

---

## 9. Theming

The Transformation Editor uses the standard EmbedKit design tokens, so it inherits your theme automatically:

- Modal, inputs, buttons and menus follow the `--boomi-modal-*`, `--boomi-input-*`, `--boomi-btn-*`, and `--boomi-menu-*` tokens.
- The error surfaced when AI generation fails uses the notice/alert tokens (`--boomi-notice-*`).
- The Ace script editor switches between a dark and light editor theme based on `boomiConfig.theme.darkModeTheme`.

See [Configuration Reference → CSS Design Tokens](./ConfigurationReference.md#9-css-design-tokens) for the full list.

---

## 10. Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| **No "Generate" panel** in the editor | `enableAi` is not `true` in `boomi.config.js`. Manual authoring still works. |
| **"AI Transformation feature is not enabled for this account."** | The tenant `ai` block is missing a required field: always `ai.enabled` + `ai.model`, plus `ai.apiKey` (OpenAI) or `ai.boomiAgentId` (Boomi Agent Studio). Provide them server-side. |
| **"Agent Studio did not return a parseable transformation response."** (502) | The `boomi-agent-studio` agent returned something other than the expected structured JSON. Ensure the agent runs in **structured mode** and its output schema matches the transformation shape (`isTransformation`, `name`, `script`, `inputs`, `outputs`). |
| **"This assistant only generates data transformation scripts."** (422) | The prompt was not a field-transformation request (or attempted to steer the model elsewhere). Rephrase as a concrete input→output transformation. |
| **"The generated transformation was rejected because it attempted to use disallowed operations."** (422) | The generated script referenced a blocked primitive (network, I/O, eval, etc.). Re-describe it as a pure, self-contained transformation. |
| **Generated prompt error: prompt too long** | Prompts are capped at 2000 characters. |
| **Test shows an error but Save works** | The **Test** runner executes your script locally against the sample inputs; fix the script logic or the sample values. Testing never blocks saving. |
| **Save fails validation** | Ensure the script is non-empty, there is at least one output, and no output is named the literal `output`. |

---

*For first-time setup see [Getting Started](./GettingStarted.md). For all configuration options and CSS tokens see [Configuration Reference](./ConfigurationReference.md). For the public/CDN embed flow see [CDN Configuration](./CDNConfiguration.md).*

---

## 11. Editing platform-defined functions (convert to script)

Since `@boomi/embedkit-sdk` 1.4.0, installing an integration pack copies the publisher's default mappings **and functions** into the customer's map extensions, so **Edit Map(s)** opens with the partner's `CurrentDate`, `TrimWhitespace`, user-defined functions and so on already on the canvas. The Transformation Editor only authors Custom Scripting, so by default those functions show their connections, can be wired and deleted, but have **no Edit action** and are saved back to the platform exactly as received.

Set `components[componentKey].updateMaps.convertFunctionsToScript: true` to let customers edit them. Choosing **Edit** on a convertible function:

1. asks the server to compile it (`POST /api/v1/map-extensions/compile-function`) — deterministic templates, no LLM;
2. opens the result in the editor with any compiler warnings as a banner comment at the top of the script;
3. emits `map.function.converted`.

Saving turns it into an ordinary Custom Scripting function and **replaces the partner's function**. Pin names become identifier-safe (`Original String` → `originalString`) while pin keys are preserved, so existing mapping lines keep working. From there the AI panel (§ 4) works on it like any other script.

**What converts**

| Group | Types |
|---|---|
| Strings | `TrimWhitespace`, `LeftTrim`, `RightTrim`, `StringToLower`, `StringToUpper`, `StringAppend`, `StringPrepend`, `StringRemove`, `StringReplace`, `StringConcat`, `StringSplit` |
| Math | `MathAdd`, `MathSubtract`, `MathMultiply`, `MathDivide`, `MathABS`, `MathCeil`, `MathFloor`, `MathSetPrecision` |
| Dates | `CurrentDate` (Boomi default mask `yyyyMMdd HHmmss.SSS`), `DateFormat` (Java-style masks `yyyy MM dd HH mm ss SSS`) |
| Scripting | `CustomScripting` in JavaScript passes through. A **Groovy** script is emitted as a commented TODO with the original source and the warning `groovy-step` — rewrite it in JavaScript, or let the AI panel do it. |
| User-defined | `UserDefined` — the function's steps are inlined in order as self-contained blocks and wired exactly as the UDF defines; every step must itself be convertible. |

**What does not convert** (no Edit action even with the flag on): `SimpleLookup`, `CrossRefLookup`, `DocumentCacheLookup`, `PropertyGet`, `PropertySet`, `DocumentPropertyGet`, `DocumentPropertySet`, `JapaneseCharacterConversion` (platform services), `Count`, `Sum`, `RunningTotal`, `SequentialValue`, `LineItemIncrement` (state across documents), `NumberFormat`.

> Converting is a one-way, customer-owned copy: it no longer follows the partner's function, and caching behaviour (`cacheType`) is not carried into the script. Keep the flag off if you want customers to stay on the partner's functions.
