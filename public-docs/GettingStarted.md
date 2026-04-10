# Boomi EmbedKit — Getting Started

**Boomi EmbedKit** is an embeddable plugin that lets you surface Boomi experiences — Integrations, Connections, Schedules, Mapping, and more — inside your own application. It works in **React**, **vanilla JavaScript (ES Modules)**, and **CommonJS** environments and is designed to be **themeable** so you can match your product's look and feel.

- 📚 Full setup & API details: **[Boomi Product Documentation](https://help.boomi.com/)**

---

## Installation

`@boomi/embedkit` and `@boomi/embedkit-sdk` are published publicly on npm. No `.npmrc` or private registry configuration is required.

Install the package using your preferred package manager:

```sh
npm install @boomi/embedkit
```

```sh
yarn add @boomi/embedkit
```

---

## Setup the Plugin

The Boomi plugin needs to be initialized within your application to render the UI components. There are two parts of the configuration that must be completed to properly enable the plugin.

The expected flow of information from your client and server to the EmbedKit is detailed below.

### Prerequisites

1. You have obtained a Parent / Child Account within Boomi. This is a specific account structure that is required for multi-tenant embed scenarios.
2. Within your parent account you have created an Auth User and API Token. Please refer to the Boomi documentation for instructions.
3. Your users — the people who will be using the EmbedKit — have sub-accounts under your primary Boomi account. Note: this can be done programmatically within your application by leveraging the Boomi Platform API.
4. You have a web application and a server capable of making HTTP calls to the EmbedKit API.
5. Your web application's origin and your Boomi Parent Account ID (your `tenantId`) must be registered to allow CORS access to the EmbedKit Server from your web application. This can be done by opening a request with Boomi Support or by contacting the Boomi Embedded team. Please provide all known origins in the request.

---

### Server-Side Configuration Example

This is an example of a Node.js endpoint to handle the POST request from your web application client.

> **Note:** Your `tenantId` is your Boomi Parent Account ID, which can be found within the Boomi Platform. Please read this entire guide before developing your solution to ensure all requirements are met.

```js
/* API endpoint to handle auth requests to this server */
app.post('/api/session', async (req, res) => {
  /**
   * Authenticate your user against your database.
   * In this example we are using MongoDB and looking the user up by email address.
   * Once found, we compare the password provided during login.
   **/
  const { email, password } = req.body || {};
  const user = await Users.findOne({ email });
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid Credentials.' });
  }

  /**
   * Build the Boomi credential payload (server-to-server only).
   * Never expose these credentials to the browser.
   **/
  const boomiPayload = {
    url: env.BOOMI_PLATFORM_URL,                    // Boomi Platform API endpoint. Example: https://api.boomi.com/partner/api/rest/v1
    parentAccountId: env.BOOMI_PARENT_ACCOUNT_ID,   // Your Boomi Parent Account ID. Found in Boomi Platform → Account Settings.
    apiUserName: env.BOOMI_API_USER_NAME,            // Boomi API username. Must come from the parent account.
    apiToken: env.BOOMI_API_TOKEN,                   // Boomi API token. Must come from the parent account.
    childAccountId: user.boomi_account_id,           // The child account ID stored on your user record.
    accountGroup: user.boomi_account_group,          // The account group stored on your user record.

    // Optional: Required only if your integrations use OAuth2-connected systems within Boomi.
    oauth2: {
      connections: {
        'INTEGRATION_PACK_ID': {                     // The connection ID for this OAuth2 connection. Found in Boomi Platform.
          clientId: 'CLIENT_ID',                     // The client ID provided by the Identity Provider.
          clientSecret: 'CLIENT_SECRET',             // The client secret provided by the Identity Provider.
        },
      },
    },

    // Optional: Required only if you are enabling AI features in EmbedKit.
    ai: {
      enabled: true,
      model: 'gpt-4o-2024-08-06',                   // The OpenAI model to use. OpenAI is the only supported LLM at this time.
      apiKey: 'API_KEY',                             // Your OpenAI API key.
      url: 'BOOMI_LISTENER_URL',                     // The Boomi listener URL. Found in the runtime configuration.
      userName: 'BOOMI_LISTENER_USER',               // The Boomi listener username. Found in the runtime configuration.
      userToken: 'BOOMI_LISTENER_PASSWORD',          // The Boomi listener password. Found in the runtime configuration.
    },
  };

  /**
   * Call the auth/login endpoint on the EmbedKit Server to obtain a one-time-use HMAC nonce.
   * The nonce has a TTL of 2 minutes and must be exchanged for a JWT by the EmbedKit client immediately.
   **/
  try {
    const origin = req.headers.origin || '';
    const r = await fetch(`${env.EMBEDKIT_SERVER_BASE}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Origin': origin,
        'X-Tenant-Id': config.boomi_primary_account || '',
      },
      body: JSON.stringify(boomiPayload),
    });

    if (!r.ok) {
      const errText = await r.text().catch(() => '');
      return res.status(r.status).json({ error: 'Login failed.', detail: errText });
    }
    const { nonce, ttlSec } = await r.json();

    /**
     * Return the nonce to your user interface.
     * The nonce will be used by the EmbedKit Plugin to mint a short-lived JWT.
     **/
    return res.json({ nonce, ttlSec, serverBase: env.EMBEDKIT_SERVER_BASE, tenantId: config.boomi_primary_account });
  } catch (e) {
    return res.status(502).json({ error: 'EmbedKit Server unreachable.' });
  }
});

// Logout — destroy the server-side session when the user logs out of the host application
app.delete('/api/session', (req, res) => {
  res.clearCookie('sid', cookieOptions(req));
  res.json({ ok: true });
});
```

---

### Client-Side Configuration Example

This is a simplified example of the EmbedKit within a CommonJS web application client.

**Step 1.** Create an HTML `<div>` element on the page where you want to render the Boomi EmbedKit components. Provide an `id` of `"boomi"`.

```html
<body>
  <div id="boomi"></div>
</body>
```

**Step 2.** Initialize the plugin within your application using a `<script>` tag or a separate `.js` file.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Boomi EmbedKit</title>
  </head>
  <body>
    <div id="boomi"></div>
    <script type="module" src="./main.js"></script>
  </body>
</html>
```

**Step 3.** Create the `BoomiPlugin` instance and render a component, passing the required credentials.

> **Note:** The example below calls the server endpoint described above to authenticate the user and retrieve the nonce.

```js
import BoomiPlugin from '@boomi/embedkit';   // Import the EmbedKit plugin
import uiConfig from './boomi.config';        // Import your local UI config

// Track whether the plugin has been initialized before attempting to render components
let boomiReady = null;

/* Authenticate the user and initialize the plugin */
async function login(email, password) {
  if (!email || !password)
    return { ok: false, message: 'Email and password are required.' };

  const res = await serverLogin(email, password);
  if (!res.ok) return res;

  await initBoomiFromServer(res.data);
  return { ok: true };
}

/* POST credentials to your server, which calls the EmbedKit auth endpoint */
async function serverLogin(email, password) {
  const res = await fetch(`${import.meta.env?.VITE_SERVER_URL}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    let data = null;
    try { data = JSON.parse(raw); } catch {}
    const msg = data?.error || data?.message || raw?.slice(0, 200) || 'Unable to sign in.';
    return { ok: false, message: msg };
  }

  const ct = res.headers.get('content-type') || '';
  const raw = await res.text();
  let data = null;
  if (ct.includes('application/json')) {
    try { data = JSON.parse(raw); } catch {}
  }

  return { ok: true, data };
}

/* Destroy the EmbedKit session when the user logs out of the host application */
async function logout() {
  boomiReady = null;
  await serverLogout();
  DestroyPlugin({ removeHost: true, clearTheme: true, clearAuth: true });
}

/* Call your server logout endpoint to invalidate the session cookie */
async function serverLogout() {
  try {
    await fetch(`${import.meta.env?.VITE_SERVER_URL}/api/session`, {
      method: 'DELETE',
      credentials: 'include',
    });
  } catch {}
}

/* Use the nonce returned from the server to initialize the EmbedKit Plugin and mint a JWT */
async function initBoomiFromServer(res) {
  BoomiPlugin({
    serverBase: res.serverBase,   // Base URL of the EmbedKit server
    tenantId: res.tenantId,       // Your Boomi Parent Account ID
    nonce: res.nonce,             // One-time-use nonce from the EmbedKit auth endpoint
    boomiConfig: uiConfig,        // Contents of your boomi.config.js file
  });

  // Wait one animation frame to ensure the plugin has fully mounted before rendering components
  boomiReady = new Promise((resolve) => requestAnimationFrame(resolve));
  return boomiReady;
}

/* Ensures all component renders wait until the plugin is ready */
function runAfterBoomiReady(fn) {
  (boomiReady || Promise.resolve()).then(fn);
}

/* Renders an EmbedKit component into the specified host element */
let __boomiRenderNonce = 0;
function renderBoomiComponent({ hostId, component, props = {} }) {
  __boomiRenderNonce += 1;
  runAfterBoomiReady(() =>
    RenderComponent({
      hostId,                                              // e.g. 'boomi'
      component,                                           // e.g. 'Integrations'
      props: { ...props, __refresh__: __boomiRenderNonce },
    })
  );
}

/* Example: Render the Integrations component into the dashboard */
function renderDashboard(node) {
  node.innerHTML = `
    <div id="boomi">
      <p>Loading integrations...</p>
    </div>
  `;
  const dashBoomi = node.querySelector('#boomi');
  if (dashBoomi) {
    renderBoomiComponent({
      hostId: 'boomi',
      component: 'Integrations',
      props: { componentKey: 'integration' },
    });
  }
}
```

---

## Authentication & Authorization

EmbedKit uses JWT authentication between the UI components and the EmbedKit Server API. This requires CORS to be configured. To mint a JWT, the EmbedKit Server API must receive validated Boomi Platform credentials as described above.

EmbedKit assumes that your application will handle authenticating and authorizing your users **before** initializing the EmbedKit Plugin. We recommend storing all Boomi credentials in an encrypted data store within your database on your internal user's profile, and providing that information only after successfully authenticating and authorizing your users.

If required, you can install and configure the EmbedKit server locally within your environment. For more information, please reach out to customer support or the Boomi Embedded team.

### Authentication Flow

The full end-to-end authentication flow is:

1. Your web application authenticates the user against your server endpoint using your own auth mechanism.
2. Once authenticated, your server constructs the Boomi payload as described above.
3. Your server sends an authentication request to the EmbedKit Server (`POST /auth/login`).
4. If authentication is successful, the EmbedKit Server responds with a one-time-use HMAC nonce. The nonce has a TTL of 2 minutes.
5. Your server returns the nonce to your web application client.
6. The EmbedKit Plugin is initialized on the client, providing the nonce as an argument.
7. The EmbedKit Plugin exchanges the nonce for a JWT. The JWT has a TTL of 10 minutes — all token refreshes are handled automatically by the EmbedKit.
8. The EmbedKit Server mints the JWT and a refresh token cookie (`RT Cookie`).
9. To render an EmbedKit component, call the `RenderComponent` method as described below.
10. When the user ends their session on your web application, call the EmbedKit logout endpoint to invalidate the server-side session.

---

## Rendering a Component

Each EmbedKit component has a number of predefined configuration options that can be passed when the component is rendered. These options are passed via `props`. Refer to the SDK for the full list of available parameters for each component.

> [!NOTE]
> The properties available for each component vary — refer to the SDK for the complete reference. However, every component supports the following common properties:
>
> ```ts
> @property {boolean} showTitle       - Whether the component title should be displayed.
> @property {string}  [title]         - Optional override for the component title text.
> @property {boolean} showDescription - Whether the component description should be displayed.
> @property {string}  [description]   - Optional override for the component description text.
> ```

Add the host element where the component should render:

```html
<div id='boomi'>{component will render here}</div>
```

Call `RenderComponent` to mount the component:

```js
import { RenderComponent } from '@boomi/embedkit';

RenderComponent({
  targetId: 'boomi',                   // Optional: override to target a different element ID (default: "boomi")
  component: 'Integrations',           // Required: the name of the component to render
  props: {
    componentKey: 'integrationsMain',  // Optional: use a unique key when rendering more than one component of the same type
  },
});
```

---

## Styling & Theming

The plugin maps CSS variables to ready-made utility classes (e.g., `.boomi-btn-primary`, `.boomi-input`, `.boomi-card`) so your overrides cascade consistently across all UI elements.

### Built-in Themes

| Theme   | Look & Feel Summary                                          | When to Use                                                     |
|---------|--------------------------------------------------------------|-----------------------------------------------------------------|
| `light` | Neutral, accessible light palette with subtle shadows.       | Standard web apps where light mode is the primary experience.   |
| `dark`  | High-contrast dark palette tuned for low-light environments. | Developer tools, dashboards, and night-friendly apps.           |
| `boomi` | Boomi-branded accents and backgrounds, polished styling.     | When you want Boomi's brand language out of the box.            |

You can:
- **Enable** theme switching for users.
- **Set a default theme** at startup.
- **Create your own theme(s)** by defining CSS variables under `cssVarsByTheme` in `boomi.config.js`.

### `boomi.config.js` at a Glance

```js
// boomi.config.js
export default {
  enableAi: true,            // Enable AI features. AI credentials must be provided during auth for this to work.
  theme: {
    allowThemes: true,       // Allow users or your app to toggle themes at runtime.
    defaultTheme: 'dark',    // Starting theme: 'light' | 'dark' | 'boomi' | '<your-custom-key>'
  },
  integrationsMain: {                              // Default configuration key for the Integrations component
    integrations: {
      title: 'My Integrations',                    // Optional: title displayed on the Integrations page
      description: 'This is a sample description', // Optional: description displayed on the Integrations page
    },
  },

  // Define per-theme CSS variable overrides using design tokens
  cssVarsByTheme: {
    cartoon: {
      '--boomi-root-bg-color': '#A0E8AF',
      '--boomi-btn-primary-bg': '#FFDE59',
      '--boomi-btn-primary-fg': '#2B2B2B',
      // Override any other design tokens here
    },
  },
};
```

### Creating a Custom Theme

Define a new key under `cssVarsByTheme` and override any CSS variables you need. The plugin's CSS uses these tokens throughout buttons, inputs, cards, menus, tables, modals, wizards, mapping canvas, schedules, and more.

```js
// boomi.config.js (excerpt)
export default {
  theme: {
    allowThemes: true,
    defaultTheme: 'cartoon',  // Use your custom theme as the default
  },
  cssVarsByTheme: {
    cartoon: {
      /* Brand & Surface */
      '--boomi-root-bg-color': '#A0E8AF',
      '--boomi-page-bg-color': '#A0E8AF',
      '--boomi-header-bg-color': '#5CD4F0',
      '--boomi-header-fg-color': '#000000',

      /* Buttons */
      '--boomi-btn-primary-bg': '#FFDE59',
      '--boomi-btn-primary-fg': '#2B2B2B',
      '--boomi-btn-primary-border': '#000000',
      '--boomi-btn-primary-shadow': '4px 4px 0 #000000',
      '--boomi-btn-primary-bg-hover': '#FFD633',

      /* Inputs */
      '--boomi-input-bg': '#FFFFFF',
      '--boomi-input-fg': '#2B2B2B',
      '--boomi-input-border': '#000000',
      '--boomi-input-shadow': '3px 3px 0 #000000',

      /* Cards */
      '--boomi-card-bg': '#FFFFFF',
      '--boomi-card-border': '#000000',
      '--boomi-card-shadow': '4px 4px 0 #000000',

      /* Notices */
      '--boomi-notice-success-bg': '#6EEB83',
      '--boomi-notice-success-fg': '#111111',
      '--boomi-notice-success-border': '#000000',
    },
  },
};
```

Your theme cascades across all plugin UI that uses the provided classes (`.boomi-btn-primary`, `.boomi-input`, `.boomi-card`, etc.).

### How Tokens Map to UI Elements

| UI Element          | Class Example              | Core Tokens                                                                                                              |
|---------------------|----------------------------|-------------------------------------------------------------------------------------------------------------------------|
| **Primary Button**  | `.boomi-btn-primary`       | `--boomi-btn-primary-bg`, `--boomi-btn-primary-fg`, `--boomi-btn-primary-border`, `--boomi-btn-primary-shadow`          |
| **Secondary Button**| `.boomi-btn-secondary`     | `--boomi-btn-secondary-bg`, `--boomi-btn-secondary-fg`, `--boomi-btn-secondary-border`, `--boomi-btn-secondary-shadow`  |
| **Inputs**          | `.boomi-input`             | `--boomi-input-bg`, `--boomi-input-fg`, `--boomi-input-border`, `--boomi-input-shadow`, `--boomi-input-border-focus`    |
| **Cards / Panels**  | `.boomi-card`              | `--boomi-card-bg`, `--boomi-card-border`, `--boomi-card-shadow`, `--boomi-card-hover-shadow`                            |
| **Menus**           | `.boomi-menu` / `-item`    | `--boomi-menu-bg`, `--boomi-menu-fg`, `--boomi-menu-border`, `--boomi-menu-item-bg-hover`                               |
| **Modals**          | `.boomi-modal-*`           | `--boomi-modal-bg`, `--boomi-modal-fg`, `--boomi-modal-border`, `--boomi-modal-shadow`                                  |
| **Notices / Alerts**| `.boomi-notice`            | `--boomi-notice-*-bg`, `--boomi-notice-*-fg`, `--boomi-notice-*-border`, `--boomi-notice-shadow`                       |
| **Wizard**          | `.boomi-wizard*`           | `--boomi-wizard-step-dot-*`, `--boomi-wizard-card-*`, `--boomi-wizard-link-*`                                           |
| **Tables**          | `.boomi-table-*`           | `--boomi-table-header-*`, `--boomi-table-row-odd-bg`, `--boomi-table-row-even-bg`                                       |
| **Mapping Canvas**  | `.boomi-map-*`             | `--boomi-map-line`, `--boomi-map-card-*`, `--boomi-map-pin-*`, `--boomi-accent`, `--boomi-muted`                        |
| **Schedule UI**     | `.boomi-sched-*`           | `--boomi-sched-card-*`, `--boomi-sched-header-*`, `--boomi-sched-input-*`, `--boomi-sched-action-*`                    |

You can override only the tokens you need — everything else inherits from the active theme (`light`, `dark`, `boomi`, or your custom theme).

### Switching Themes at Runtime

If `theme.allowThemes = true`, your application can switch themes by setting the `data-theme` attribute on the plugin host element:

```html
<div id="boomi" data-theme="light"></div>
<div id="boomi" data-theme="dark"></div>
<div id="boomi" data-theme="boomi"></div>
<div id="boomi" data-theme="cartoon"></div>
```

You can also update this attribute programmatically through your own theme switcher. If you do not toggle themes at runtime, the plugin uses `theme.defaultTheme` from `boomi.config.js`.

### Theming Tips

- Start with `boomi` for a polished look, then override a handful of tokens for brand alignment.
- Maintain accessible contrast — especially for **inputs**, **buttons**, and **table text**.
- Scope overrides per theme in `cssVarsByTheme` so you can switch safely without style leakage.
- AI settings are optional — omit the `ai` block entirely if you do not use AI features.

---

## Agents

As of EmbedKit v1.3.0, you can embed Boomi Agents as a special type of EmbedKit component. This feature allows you to create agents in Boomi and expose them to your users through the EmbedKit.

### Agent Transport Types

EmbedKit supports two agent transport types, configured via the `transport` field in your project configuration:

| Transport | Description |
|-----------|-------------|
| `boomi-direct` | Routes agent messages directly to the Boomi Platform via the agent session endpoint. This is the standard transport for agents deployed and managed within Boomi. |
| `boomi-proxy` | Routes agent messages through the EmbedKit proxy layer. Used when direct Boomi Platform access is not available or when additional request handling is required by the EmbedKit Server. This is the default if `transport` is not specified. |

> **Note:** File attachments are currently not supported when using the `boomi-direct` transport.

### How to Create and Deploy an Agent

To deploy an Agent through EmbedKit, two process components are required within Boomi:

- **Agent Router** — Deployed at the parent account level as a Web Server Listener. This process routes all inbound agent messages from EmbedKit to the appropriate Boomi Agentic Flows.
- **Agent Executor** — The core orchestration process, deployed at the parent account level. It handles all routing logic and delegates work to individual Agentic Flows.

#### Building the Agent Router

**Step 1.** Within Boomi, create a Web Server Listener process at the parent account level. This will serve as the router for all agent requests from the EmbedKit.

**Step 2.** Configure the start shape of that Boomi process as follows:

- Operation Type: `EXECUTE`
- Object: `Agent`
- Expected Input Type: `Multipart/form-data`
- Response Output: `Single JSON Object`
- Response Profile: (see Message Format below)
- Attachment Cache: (see Step 3 below)

**Step 3.** Add a Branch Shape directly after the start shape listener. It should have exactly two branches:

- **Branch 1 — Store incoming data in Document Cache:**
  - Add a **Data Process** shape configured to map Multipart Form Data (MIME) to JSON and write it to the Document Cache.
  - Follow with a **Stop and Continue** shape.

- **Branch 2 — Main processing branch:**
  - Add a **Retrieve From Document Cache** shape:
    - MIME Property Name: static value of `"body"`.
  - Add a **Set Document Properties** shape with the following properties:
    - MIME Property — MIME Document
    - Dynamic Process Property — `sessionId` (from the request profile)
    - Dynamic Process Property — `message` (from the request profile)
    - Dynamic Process Property — `integrationPackId` (from the request profile)
    - Dynamic Process Property — `previousResponseId` (from the request profile)
  - Add a **Process Route** shape — this is the heart of the Agent Router:
    - On the **General** tab, define two path names (recommended: `"Success"` and `"Failure"`).
    - On the **Process Routing** tab, provide the mapping between Integration Pack IDs (agents) and their corresponding Agent Executor processes.

### Message Format (Request & Response Profiles)

The following JSON structure defines the request and response profile used by the Agent Router within Boomi:

```json
{
  "sessionId": "9f78c9d0-6f8c-4d11-b2df-6a9f7e6c6a10",
  "previousResponseId": "some_previous_response_id",
  "integrationPackId": "SW50ZWdyYXRpb25QYWNrSW5zdGFuY2U3MTk2NTY",
  "agentCommand": "start",
  "parentAccountId": "1234567890",
  "childAccountId": "0987654321",
  "message": {
    "role": "user",
    "type": "json",
    "content": {
      "data": "JSON DATA HERE",
      "title": "EmbedKit Session Data",
      "html": "<div><h1>EmbedKit Session Data</h1><p>This is an example of HTML content.</p></div>"
    },
    "metadata": {
      "timestamp": "2025-10-30T15:12:45.000Z",
      "platform": "embedkit-ui",
      "language": "en-US"
    }
  }
}
```

---

## Resources

📚 **Documentation**: [Boomi EmbedKit Product Documentation](https://help.boomi.com/)
