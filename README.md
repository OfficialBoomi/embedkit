# Boomi EmbedKit

**Boomi EmbedKit** (`@boomi/embedkit`) is a white-label embeddable plugin that lets you surface Boomi-powered experiences — Integrations, Connections, Scheduling, Data Mapping, and AI Agents — directly inside your own application. It runs inside a Shadow DOM so its styles are fully isolated from your host app, and it ships its own React/ReactDOM bundle so no dependencies are required on the host page.

This is the official Boomi EmbedKit. If you fork or change this code, you should not use the name Boomi for your version.

### What You Can Embed

| Component | Description |
|-----------|-------------|
| **Integrations** | List, run, and monitor integration pack instances for a Boomi sub-account |
| **Connections** | Let users configure and save connection credentials |
| **Schedules** | View and modify process schedule settings |
| **Mapping** | Interactive data mapping canvas for field-level transformations |
| **AI Agents** | Conversational AI agent chat UI backed by your Boomi Agentic flows |

### Integration Methods

EmbedKit supports three integration paths depending on your stack:

| Method | Package | Best For |
|--------|---------|----------|
| **React** | `@boomi/embedkit` via npm | React applications — use `EmbedKitProvider` + `RenderComponent` |
| **ES Module / CommonJS** | `@boomi/embedkit` via npm | Vanilla JS, Node-backed apps, any bundler |
| **CDN (Public Embed)** | Drop-in UMD script via `cdn.boomi.space` | Any existing website — no build tools required |

### Authentication

EmbedKit uses a nonce → JWT exchange pattern. Your server authenticates the user, calls the EmbedKit Server to get a short-lived nonce, and passes it to the client. The plugin exchanges the nonce for a JWT and handles all token refresh automatically. The CDN path uses a public token + per-project allow-listed origins instead of a server-side session.

---

## Documentation

| Guide | Description |
|-------|-------------|
| [Getting Started](./public-docs/GettingStarted.md) | Installation, server-side setup, client initialization, component rendering, theming |
| [CDN Configuration](./public-docs/CDNConfiguration.md) | Full CDN (public embed) setup — Admin Console walkthrough, embed types, configuration reference, troubleshooting |
| [Release Notes](./public-docs/ReleaseNotes.md) | Version history and upgrade notes |
| [API Reference](./docs-md/README.md) | Full TypeDoc-generated API reference (types, hooks, functions) |

---

## Installation

```sh
npm install @boomi/embedkit
# or
yarn add @boomi/embedkit
```

---

## Quick Start — React

```jsx
import BoomiPlugin, { RenderComponent } from '@boomi/embedkit';
import uiConfig from './boomi.config';

// After your server returns a nonce:
BoomiPlugin({
  serverBase: 'https://your-embedkit-server.com/api/v1',
  tenantId: 'YOUR_BOOMI_PARENT_ACCOUNT_ID',
  nonce: nonceFromServer,
  boomiConfig: uiConfig,
});

// Render a component into <div id="boomi" />
RenderComponent({
  hostId: 'boomi',
  component: 'Integrations',
  props: { componentKey: 'integrationsMain' },
});
```

---

## Quick Start — CDN (Public Embed)

For embedding Boomi AI Agents on any existing website — no npm, no build pipeline required.

**1. Create a project** in the [EmbedKit Admin Console](https://admin.boomi.space), configure your agent and origins, and copy the generated public token.

**2. Add to your HTML:**

```html
<!-- EmbedKit stylesheet -->
<link rel="stylesheet" href="https://cdn.boomi.space/cdn/embedkit-cdn.css" />

<!-- Configure the embed -->
<script>
  window.BoomiEmbed = {
    publicToken: "pk_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    agentId:     "project_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    mountId:     "boomi-agent",
    serverBase:  "https://api.boomi.space/api/v1"
  };
</script>

<!-- Load the bundle (React + ReactDOM bundled in) -->
<script src="https://cdn.boomi.space/embedkit-cdn.umd.cjs" async></script>

<!-- Mount target -->
<div id="boomi-agent"></div>
```

### CDN Assets

| File | Purpose |
|------|---------|
| `https://cdn.boomi.space/embedkit-cdn.umd.cjs` | JavaScript bundle (UMD — works in all browsers) |
| `https://cdn.boomi.space/cdn/embedkit-cdn.css` | Required stylesheet |

### CDN Configuration Properties

| Property | Required | Description |
|----------|----------|-------------|
| `publicToken` | Yes | The `pk_...` token from your project in Admin Console |
| `agentId` | Yes | The project ID (`project_...`) from Admin Console |
| `serverBase` | Yes | EmbedKit API base URL: `https://api.boomi.space/api/v1` |
| `mountId` | No | ID of the `<div>` to mount into. Defaults to `"boomi-agent"` |
| `userId` | No | Your user's identifier for session tracking / analytics |
| `autoInit` | No | Set to `false` to defer initialization until you call it manually |

### CDN Embed Types

The CDN supports three presentation modes, configured in the Admin Console:

| Type | Description |
|------|-------------|
| `single` | Floating launcher pill → opens one agent in a modal |
| `tiles` | Inline grid of agent cards — users pick and launch |
| `list` | Floating pill → opens a searchable agent list modal |

For the full CDN setup walkthrough including CORS configuration, the Admin Console, all agent UI options, platform-specific examples (WordPress, Salesforce), and troubleshooting, see [CDN Configuration](./public-docs/CDNConfiguration.md).

---

## Theming

EmbedKit ships three built-in themes (`boomi`, `light`, `dark`) and supports fully custom themes via CSS variables in `boomi.config.js`.

```js
// boomi.config.js
export default {
  theme: {
    defaultTheme: 'boomi',   // 'light' | 'dark' | 'boomi' | '<your-custom>'
    allowThemes: true,
  },
  cssVarsByTheme: {
    'my-brand': {
      '--boomi-root-bg-color': '#0f172a',
      '--boomi-btn-primary-bg': '#2563eb',
      '--boomi-btn-primary-fg': '#ffffff',
    },
  },
};
```

Full theming reference (all CSS tokens, built-in themes, runtime switching) is in [Getting Started](./public-docs/GettingStarted.md#styling--theming-overview).

---

## Examples

Working examples are available in the **[embedkit-examples](https://github.com/OfficialBoomi/embedkit-examples)** repository, including React and vanilla JS implementations.

You can also open the React example directly on StackBlitz:
[Boomi EmbedKit React Example](https://stackblitz.com/~/github.com/OfficialBoomi/embedkit)

---

## Release Notes

See [Release Notes](./public-docs/ReleaseNotes.md) for version history.
