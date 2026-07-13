# EmbedKit — Release Notes

> This page tracks public releases of **Boomi EmbedKit**. For installation and upgrade steps, see [GettingStarted.md](./GettingStarted.md).

---

### Latest

![Version](https://img.shields.io/badge/version-v1.5.0-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/status-stable-brightgreen?style=for-the-badge)

---

### All Releases

<details open>
  <summary><strong>v1.5.0</strong> — Response feedback & standardized event callbacks</summary>

  **Highlights**
  - ✅ **Response feedback (thumbs up / down / comment)** — Agent responses now show configurable feedback controls. Ratings and comments are delivered to **your application** together with the user's prompt and the agent's response — EmbedKit never sends feedback over the network itself, so there is no endpoint to secure. Icons, labels, comment box text, and visibility are configurable per agent (`agents.<id>.feedback`), and styling is fully themeable via new `--boomi-agent-feedback-*` design tokens.
  - ✅ **Standardized event system** — New app-level callback pattern for all EmbedKit events (feedback is the first; future event types follow the same envelope). Every event is `{ type, timestamp, source, data }`. Subscribe with `BoomiPlugin({ onEvent })` (also `window.BoomiEmbed.onEvent` for CDN embeds), `BoomiEvents.on('feedback' | '*', handler)` from the package root, or the `boomi:event` DOM CustomEvent on `window` for plain-JS pages. Subscriber errors are isolated and never break the embed UI.
  - ✅ **Zero-config enablement** — The feedback bar appears automatically when a programmatic subscriber is registered; `feedback.enabled` force-shows (for DOM-only listeners) or force-hides it.
  - ✅ **Documentation** — New [Events & Callbacks](./ConfigurationReference.md#10-events--callbacks) section in the Configuration Reference covers the envelope, all three subscription methods, and the feedback event shape; the Agent Configuration section documents the `feedback` config block and CSS tokens.

</details>

---

<details>
  <summary><strong>v1.4.19</strong> — Boomi Agent Studio transformation provider</summary>

  **Highlights**
  - ✅ **Agent Studio as an AI transformation provider** — The Transformation Editor's AI generation can now run against one of your own **Boomi Agent Studio** agents instead of OpenAI. Select it per tenant with `ai.model: 'boomi-agent-studio'` and `boomiAgentId`; the call authenticates with the tenant's existing Boomi platform token — no OpenAI key required. `sessionType: 'single'` (one-shot) is supported today.
  - ✅ **Same output, same guardrails** — The agent returns OpenAI-style structured JSON, which the server validates and runs through the identical guardrails and output shape as the OpenAI path, so the editor behaves the same. A prose refusal surfaces as a clean 422.
  - ✅ **Documentation** — The [Transformation Editor](./TransformationEditor.md) guide now documents provider selection, the `boomiAgentId`/`sessionType` config with a working example, the structured-mode agent requirements, and troubleshooting.
  - ✅ **Dependency** — Updated `@boomi/embedkit-sdk` to **1.2.23** (adds the Agent Studio `AiConfig` fields).

</details>

---

<details>
  <summary><strong>v1.4.18</strong> — Bug Fixes: Editing Keys, Execution History Search & Delete Modal</summary>

  **Highlights**
  - ✅ **Shadow DOM editing keys** — Backspace/Delete and other editing keystrokes typed into embedded inputs are no longer swallowed by host-page key handlers. Composed keydown events targeting an editable element now stop at the shadow boundary, and the shadow root is attached with `delegatesFocus`.
  - ✅ **Execution history search now filters** — The search box on the integration execution history filters the fetched records **client-side** and matches across the **message, status, and execution time** columns. Full or partial execution times work (e.g. `2026-07-07`, `2026-07`, `14:30`, `23:59:59`). Pagination is applied to the filtered results, and a fetch loop that caused repeated requests was fixed.
  - ✅ **Delete transformation modal** — Clicking **Cancel** on the "delete transformation" confirmation in the mapping editor now closes the modal (previously it could not be dismissed).
  - ✅ **Documentation** — The [Configuration Reference](./ConfigurationReference.md) now documents **connection form validation** via `boomi.config.js`, including an example for a field that must be numeric and exactly 10 characters.
  - ✅ **Dependency** — Updated `@boomi/embedkit-sdk` to **1.2.22**.

</details>

---

<details>
  <summary><strong>v1.4.15</strong> — Chat Composer Backdrop & Wider Config Modal</summary>

  **Highlights**
  - ✅ **Chat composer backdrop** — The chat input now sits on a dedicated backdrop panel so the conversation no longer bleeds under the input as it scrolls. By default it renders as a soft transparent→solid fade with no divider line, giving the chat a cleaner, more standard look.
  - ✅ **Fully themeable** — The backdrop is driven by four new CSS design tokens that follow the existing theming system. They cascade with light, dark, `boomi`, and any custom theme, and can be overridden globally (`cssVars`) or per-theme (`cssVarsByTheme`).
  - ✅ **Admin Console support** — The new tokens are available in the theme builder's CSS Variable Overrides dropdown, so they can be configured per project without code.
  - ✅ **Wider configuration modal** — The Add/Edit Project modals in the Admin Console are now wider to comfortably fit the CSS variable editor and longer token names.
  - ✅ **Documentation** — The [Configuration Reference](./ConfigurationReference.md) and [CDN Configuration Guide](./CDNConfiguration.md) now document the composer backdrop tokens with usage examples and a complete working sample.

  **Configuration**

  The backdrop is configured with four CSS variables (defaults shown):

  ```js
  cssVars: {
    // Default look — a soft transparent→solid fade with no divider line.
    '--boomi-agent-composer-backdrop-bg': 'var(--boomi-agent-pane-bg)',
    '--boomi-agent-composer-backdrop-fade': '2.5rem',  // fade height; 0px = hard solid panel
    '--boomi-agent-composer-backdrop-line-width': '0',  // >0 to show a divider line
    '--boomi-agent-composer-backdrop-line-color': 'var(--boomi-agent-chat-border)',
  }
  ```

  | Token | Default | Purpose |
  |-------|---------|---------|
  | `--boomi-agent-composer-backdrop-bg` | `var(--boomi-agent-pane-bg)` | Solid color the panel resolves to |
  | `--boomi-agent-composer-backdrop-fade` | `2.5rem` | Transparent→solid fade height (`0px` = solid panel) |
  | `--boomi-agent-composer-backdrop-line-width` | `0` | Divider line thickness (`0` = no line) |
  | `--boomi-agent-composer-backdrop-line-color` | `var(--boomi-agent-chat-border)` | Divider line color |

  To get a solid panel with a thin divider line instead, set
  `--boomi-agent-composer-backdrop-fade: 0px` and
  `--boomi-agent-composer-backdrop-line-width: 1px`.

</details>

---

<details>
  <summary><strong>v1.4.10</strong> — Expandable Modal & Collapsible Sidebar</summary>

  **Highlights**
  - ✅ **Expandable modal** — Agents configured with `expandable: true` now show a maximize/minimize button in the modal header. Clicking it stretches the modal to fill the screen, giving users more space when working with complex responses.
  - ✅ **Collapsible sidebar** — When `expandable: true` and the sidebar is enabled, a collapse toggle appears in the sidebar header. Collapsing the sidebar hides the chat history rail and expands the main chat area. A single-icon strip allows the user to re-expand it at any time.
  - ✅ **Configuration Reference** — A new [Configuration Reference](./ConfigurationReference.md) document is now available covering every configuration option in detail: initialization, agent config, component config, form config, CDN config, and all CSS design tokens.

  **Bug Fixes**
  - Fixed an issue where agent responses containing HTML were rendered as raw text in the chat UI. Agent Studio agents that prepend plain text before an HTML block (e.g. a summary sentence followed by a `<div>`) now correctly render the full response as HTML.

  **Configuration**

  Set `expandable: true` at the root of any agent entry in `boomi.config.js`:

  ```js
  agents: {
    'my-agent-id': {
      expandable: true,   // enables both modal expand and sidebar collapse
      ui: {
        mode: 'modal',
        sidebar: { show: true },
        // ...
      },
    },
  }
  ```

  | Behavior | Applies When |
  |----------|-------------|
  | Modal expand/collapse button | `expandable: true` and `ui.mode: 'modal'` |
  | Sidebar collapse/expand toggle | `expandable: true` and `ui.sidebar.show: true` |

</details>

---

<details>
  <summary><strong>v1.4.8</strong> — HTML Content Rendering & Stability</summary>

  **Highlights**
  - ✅ Agent Studio agents that return raw HTML responses now render correctly in the chat UI. Previously, HTML content was escaped and displayed as plain text.
  - ✅ Improved robustness of SSE message handling for streaming agent responses.
  - ✅ General stability improvements and dependency updates.

  **Bug Fixes**
  - Fixed an issue where Agent Studio agents returning HTML strings via the SSE stream were not rendered as HTML in the `MessageBlock` component.

</details>

---

<details>
  <summary><strong>v1.3.24</strong> — CDN Package & jsDelivr Distribution</summary>

  **Highlights**
  - ✅ The `@boomi/embedkit-cdn` package is now published to npm and available via public CDN providers.
  - ✅ CDN assets can be referenced directly from [jsDelivr](https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/) or [unpkg](https://unpkg.com/@boomi/embedkit-cdn/).
  - ✅ The Admin Console token dialog now displays the correct jsDelivr CDN URLs in the embed snippet.
  - ✅ CDN documentation updated to reference the npm package and public CDN URLs.

  **Migration Note**
  - If you were previously referencing `cdn.boomi.space` URLs directly, update your embed snippet to use the jsDelivr or unpkg URLs. The old CDN host is deprecated.

  ```html
  <!-- Updated CDN references -->
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/embedkit-cdn.css" />
  <script src="https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/embedkit-cdn.umd.cjs" async></script>
  ```

</details>

---

<details>
  <summary><strong>v1.3.0</strong> — Boomi Agents (Public Embed & Authenticated)</summary>

  > [!IMPORTANT]
  > This release introduces Boomi Agents as a first-class EmbedKit component type. Both the authenticated plugin flow (`@boomi/embedkit` npm package) and the public CDN drop-in (`@boomi/embedkit-cdn`) support agents.

  **Highlights**
  - ✅ **Agent components** — Embed Boomi Agents directly into your application as a chat interface.
  - ✅ **Public embed (CDN)** — Drop-in script for embedding agents on any website without a build pipeline. Requires only `window.BoomiEmbed` config and a public token from the Admin Console.
  - ✅ **Public session endpoint** — The EmbedKit Server exposes `POST /api/v1/embed/session` to validate public tokens and return scoped access credentials.
  - ✅ **Multi-agent embed types** — Support for `single`, `tiles`, and `list` embed layouts to surface one or multiple agents on a page.
  - ✅ **EmbedKit Admin Console** — New admin interface at [admin.boomi.space](https://admin.boomi.space) for managing CORS origins, agents, projects, and public tokens.
  - ✅ **Transport types** — Agents can be configured with `boomi-direct` (direct Boomi Platform routing) or `boomi-proxy` (EmbedKit proxy routing).
  - ✅ **Welcome screen & prompts** — Configurable welcome screen with title, subtitle, and pre-built prompt suggestions.
  - ✅ **Session modes** — `mount` (fresh session per page load) and `multi` (persistent chat history with sidebar).
  - ✅ **File attachments** — Optional file upload support with configurable extensions, file count, and size limits.
  - ✅ **Launcher customization** — Floating pill or circle launcher with configurable position, label, icon, and offset.
  - ✅ **Custom CSS variables** — Per-theme CSS variable overrides for full visual customization of the agent chat window.
  - ⚠️ File attachments are **not supported** with the `boomi-direct` transport in this release.

</details>

---

<details>
  <summary><strong>v1.0.0</strong> — Initial Release</summary>

  > [!TIP]
  > If you rely on OAuth2 for connected systems within Boomi, plan for an upgrade path once OAuth2 support is added. Pin to this version only for evaluation purposes.

  **Highlights**
  - ✅ First public release of the Boomi EmbedKit plugin.
  - ✅ Support for embedding Boomi Integrations, Connections, Schedules, and Data Mapping components.
  - ✅ React, ES Module, and CommonJS environments supported.
  - ✅ Built-in themes: `light`, `dark`, `boomi` with full CSS variable theming system.
  - ✅ JWT authentication via HMAC nonce exchange with the EmbedKit Server.
  - ✅ Shadow DOM isolation to prevent style conflicts with the host page.
  - ⚠️ OAuth2 for connected systems within Boomi is **not supported** in this release.

</details>
