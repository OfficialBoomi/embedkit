# EmbedKit CDN (Public Embed)

## What This Is
This bundle is a minimal public embed build that auto-initializes from a global config (`window.BoomiEmbed`). It only includes what is needed to render the Agent UI via the public session endpoint.

## Build
From `embedkit/`:

```bash
npm run build
npm run build:cdn
```

Output files:
- `dist/embedkit-cdn.umd.js`
- `dist/embedkit-cdn.es.js`

## Deploy
Host the CDN file on your static host or CDN.
Recommended for browsers: `dist/embedkit-cdn.umd.js`.

Make sure the EmbedKit server is deployed with the public session endpoint:
- `POST /api/v1/embed/session`

## Requirements
The CDN bundle is self-contained (React + ReactDOM are bundled), so no extra globals are required.

## Usage (Drop-In)
```html
<script>
  window.BoomiEmbed = {
    publicToken: "pk_live_...",
    agentId: "agent_123",
    mountId: "boomi-agent",
    serverBase: "https://your-embedkit-host.com/api/v1",
    userId: "user_456",        // optional
    origin: "https://your-site.com" // optional (defaults to window.location.origin)
  };
</script>

<!-- EmbedKit CDN bundle -->
<script src="https://cdn.yourdomain.com/embedkit-cdn.umd.js"></script>

<div id="boomi-agent"></div>
```

## Notes
- `publicToken` and `agentId` must be created and linked in EmbedKit Admin.
- `mountId` defaults to `boomi-agent` if omitted.
- If you want to disable auto-init and call it manually, set `autoInit: false` and invoke `BoomiEmbedKitCdn.BoomiPublicEmbed(window.BoomiEmbed)`.
