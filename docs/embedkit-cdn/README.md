# EmbedKit CDN

This document covers the build and usage of the `@boomi/embedkit-cdn` package — the pre-built UMD bundle for the public embed (CDN drop-in) flow.

---

## What This Is

The CDN bundle is a minimal, self-contained build of EmbedKit that auto-initializes from a global `window.BoomiEmbed` configuration object. It is designed for embedding Boomi AI Agents on any website without requiring a build pipeline, npm, or React knowledge.

React and ReactDOM are bundled in. Nothing additional is required on the host page beyond the CSS stylesheet and the UMD script.

---

## Building

Run the following from the `embedkit/` root:

```bash
npm run build
npm run build:cdn
```

Output files (written to `embedkit-cdn/dist/`):

| File | Format | Description |
|------|--------|-------------|
| `embedkit-cdn.umd.cjs` | UMD | Browser-compatible bundle. Use this in `<script src="...">` tags. |
| `embedkit-cdn.es.js` | ESM | ES Module build for bundler consumption. |
| `embedkit-cdn.css` | CSS | Required stylesheet. Must be loaded alongside the JS bundle. |

---

## CDN Distribution

Once published to npm, files are automatically available via public CDN providers:

| Provider | Base URL |
|----------|----------|
| **jsDelivr** | `https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/` |
| **unpkg** | `https://unpkg.com/@boomi/embedkit-cdn/` |

Full asset URLs:

```
https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/embedkit-cdn.umd.cjs
https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/embedkit-cdn.css
```

> jsDelivr is the recommended CDN for production use — it is highly available and provides global edge caching.

---

## Server Requirements

The CDN bundle communicates with the EmbedKit Server's public session endpoint. Ensure the server is deployed with:

- `POST /api/v1/embed/session` — Validates the public token, agent ID, and origin, then returns a scoped access token and project configuration.

See the [CDNConfiguration.md](../../public-docs/CDNConfiguration.md) for the full embed session flow.

---

## Drop-In Usage

```html
<!-- 1. EmbedKit stylesheet -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/embedkit-cdn.css" />

<!-- 2. Configure the embed -->
<script>
  window.BoomiEmbed = {
    publicToken: "pk_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",  // From Admin Console → Projects → Token
    agentId:     "project_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx", // From Admin Console → Projects
    mountId:     "boomi-agent",                               // ID of the <div> to mount into
    serverBase:  "https://api.boomi.space/api/v1",            // EmbedKit API base URL
    userId:      "user_456",                                  // Optional: for session tracking
    origin:      "https://your-site.com"                      // Optional: defaults to window.location.origin
  };
</script>

<!-- 3. Load the CDN bundle -->
<script src="https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/embedkit-cdn.umd.cjs" async></script>

<!-- 4. Mount target -->
<div id="boomi-agent"></div>
```

### Configuration Properties

| Property | Required | Description |
|----------|----------|-------------|
| `publicToken` | **Yes** | The `pk_...` token from Admin Console → Projects |
| `agentId` | **Yes** | The `project_...` ID from Admin Console → Projects |
| `serverBase` | **Yes** | EmbedKit API base URL, including `/api/v1` |
| `mountId` | No | ID of the `<div>` to mount into. Defaults to `"boomi-agent"` |
| `userId` | No | Identifier for the current user (analytics / session history) |
| `origin` | No | Override the detected origin. Defaults to `window.location.origin` |
| `autoInit` | No | Set to `false` to disable automatic initialization. Default: `true` |

### Manual Initialization

If you need to defer initialization (e.g., until a user accepts a consent form):

```html
<script>
  window.BoomiEmbed = {
    publicToken: "pk_...",
    agentId:     "project_...",
    serverBase:  "https://api.boomi.space/api/v1",
    autoInit:    false
  };
</script>
<script src="https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/embedkit-cdn.umd.cjs"></script>

<script>
  // Call manually when ready
  BoomiEmbedKitCdn.BoomiPublicEmbed(window.BoomiEmbed);
</script>
```

---

## Notes

- `publicToken` and `agentId` must be created and linked via the EmbedKit Admin Console at [admin.boomi.space](https://admin.boomi.space).
- The origin of the host page must be registered in Admin Console → CORS before embed sessions will be accepted.
- `mountId` defaults to `"boomi-agent"` if omitted.
- The bundle uses Shadow DOM to isolate styles from the host page — no style conflicts with existing site CSS.
