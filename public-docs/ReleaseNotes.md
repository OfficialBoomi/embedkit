# EmbedKit — Release Notes

> This page tracks public releases of **Boomi EmbedKit**. For installation and upgrade steps, see [GettingStarted.md](./GettingStarted.md).

---

### Latest

![Version](https://img.shields.io/badge/version-v1.5.0-blue?style=for-the-badge)
![Status](https://img.shields.io/badge/status-stable-brightgreen?style=for-the-badge)

---

### All Releases

<details open>
  <summary><strong>v1.5.0</strong> — Expandable Modal & Collapsible Sidebar</summary>

  **Highlights**
  - ✅ **Expandable modal** — Agents configured with `expandable: true` now show a maximize/minimize button in the modal header. Clicking it stretches the modal to fill the screen, giving users more space when working with complex responses.
  - ✅ **Collapsible sidebar** — When `expandable: true` and the sidebar is enabled, a collapse toggle appears in the sidebar header. Collapsing the sidebar hides the chat history rail and expands the main chat area. A single-icon strip allows the user to re-expand it at any time.
  - ✅ **Configuration Reference** — A new [Configuration Reference](./ConfigurationReference.md) document is now available covering every configuration option in detail: initialization, agent config, component config, form config, CDN config, and all CSS design tokens.

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
