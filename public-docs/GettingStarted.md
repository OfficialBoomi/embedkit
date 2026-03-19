# Boomi EmbedKit — Getting Started

**Boomi EmbedKit** is an embeddable plugin that lets you surface Boomi experiences—Integrations, Connections, Schedules, Mapping, and more—inside your own app. It works in **React**, **vanilla JavaScript (ES Modules)**, and **CommonJS** environments and is designed to be **themeable** so you can match your product’s look & feel.

- 📚 Full setup & API details: **[Boomi Product Documentation](https://help.boomi.com/)**

---

## Installation

Install the package using your preferred package manager:

```sh
npm i @boomi/embedkit

or

yarn add @boomi/embedkit
```

## Setup the Plugin

The Boomi plugin needs to be initialized within your application to render the UI components. There are two 
parts of the configuration that must be made to properly enable the plugin. 

The expected flow of information from your client / server to the EmbedKit is detailed below:

### Prerequists 

1. You have obtained a Parent / Child Account within Boomi. This is a specific feature that is required. 
2. Within your parent account you have created an Auth User and API Token. Please refer to the Boomi documenation for instructions. 
3. Your users, the people that will be leveraging the EmbedKit, have sub accounts under your primary Boomi account. Note: this can 
be done programatically within your application by leveraging the Boomi Platform Api. 
4. You have a Web App and Server capable of making http calls to the EmbedKit API. 
5. Your web application Origin with your Boomi Parent Account Id (re: tenantId) will be required to allow CORS access
to the EmbedKit Server from your web application. This can be done through opening a request with Boomi Support or 
by contacting the Boomi Embedded team, please provide all known Origins in the request.  

### Server Side Configuration example

This code is an example of a Node.js enpoint to handle the post request from your Web Application Client. 

Note: Your tenantId is your Boomi Parent Account Id, and can be found within the Boomi Platform. Please continue reading this 
guide prior to developing your solution to ensure all requirements are met.  

```js
/* API to handle auth requests to this server */
app.post('/api/session', async (req, res) => {
  /** 
   * Authenticate you user against your DB. Note: in this example we are  
   * using MongoDb and looking the user up by the email address.
   * Once found we compere the password provided during login.
   **/
  const { email, password } = req.body || {};
  const user = await Users.findOne({ email });
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid Credentials.' });
  }

  /**
   * Build the Boomi credential payload (server-to-server only).
   **/
  const boomiPayload = {
    url: env.BOOMI_PLATFORM_URL,                    // Boomi Platform API Endpoint. Example: https://api.boomi.com/partner/api/rest/v1
    parentAccountId: env.BOOMI_PARENT_ACCOUNT_ID,   // Boomi Parent Account Id. Get this from Boomi Platform. 
    apiUserName: env.BOOMI_API_USER_NAME,           // Boomi api username. Get this from Boomi Platform. Note: Must come from the parent account
    apiToken: env.BOOMI_API_TOKEN,                  // Boomi Api token, Get this from Boomi Platform. Note: Must come from the parent account
    childAccountId: user.boomi_account_id,          // or however this data is stored on your user record
    accountGroup: user.boomi_account_group,         // or however this data is stored on your user record
    oauth2: config.oauth2,                          // If you require oauth2 connections this information is required
    oauth2: {                                       // Optional: If you require oauth2 connections this information is required
      connections: {
        'INTEGRATION_PACK_ID': {                    // The connection id for this oauth2 connection. Note: This can be found easily in Boomi.
          clientId: 'CLIENT_ID',                    // The client id provided by the IDP
          clientSecret: 'CLIENT_SECRENT',           // The client secret provided by the IDP
        },
      },
    ai: {                                           // Optional: To enable AI features this information must be provided. 
      enabled: true, 
      model: 'gpt-4o-2024-08-06',                   // The openAi model to leverage, openAi is the only supported LLM at this point in time.  
      apiKey: ('API_KEY',                           // Your openAi api key.  
      url: 'BOOMI_LISTENER_URL',                    // The listener url. Note: this can be found in the runtime configuration.   
      userName: 'BOOMI_LISTENER_USER',              // The listener user name. Note: this can be found in the runtime configuration.  
      userToken: 'BOOMI_LISTENER_PASSWORD',         // The listener user password. Note: this can be found in the runtime configuration. 
    },

  };

  /**
   * Call the auth/login endpoing on the EmbedKit Server to obtain a one time use HMAC nonce. 
   * The nonce has a TLS of 2 minutes. 
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
      return res.status(r.status).json({ error: 'Login Failed', detail: errText });
    }
    const { nonce, ttlSec } = await r.json();

    /**
     * Return the nonce to your user interface. The nonce will be used to create a plugin instance. 
     **/
    return res.json({ nonce, ttlSec, serverBase: EMBEDKIT_SERVER_BASE, tenantId: config.boomi_primary_account });
  } catch (e) {
    return res.status(502).json({ error: 'EmbedKit Server Unreachable.' });
  }
});

// Logout (host app)
app.delete('/api/session', (req, res) => {
  res.clearCookie('sid', cookieOptions(req));
  res.json({ ok: true });
});
```

### Client Side

This is a very simplistic example of the EmbedKit within a commonJs Web Application Client. 

1. Create a html div element on the page where you wish to render the Boomi EmbedKit components. 
Ensure you provide an ID equal to "boomi". 

```html
  <body>
    <div id="boomi"></div>
  </body>
```

2. Initialize the plugin within your application. You can utilize a script tag or a separate .js 
file to initialize the plugin. See below.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Boomi EmbedKit</title>
  </head>
  <body>
    <script type="module" src="./main.js"></script>
  </body>
</html>
```

3. Create the BoomiPlugin instance and render a component, passing the required credentials.

Note: The below is an example within a commonJS component to call the example server api above.  

```js
import BoomiPlugin from '@boomi/embedkit'; // import the embedkit
import uiConfig from './boomi.config';    // import the local config data

// set a variable to ensure the plugin is initalized prior to attempting to call RenderComponent
let boomiReady = null;       

/* Used by the example app to auth the user */
async function login(email, password) {
  if (!email || !password)
    return { ok: false, message: 'Email and password are required.' };

  // call the function to authenticate the user
  const res = await serverLogin(email, password);
  if (!res.ok) return res;

  await initBoomiFromServer(res.data);
  return { ok: true };
}

/* Login based on server side call above */
async function serverLogin(email, password) {

  // call the server with the creds
  const res = await fetch(`${import.meta.env?.VITE_SERVER_URL}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  // if not successful throw and error
  if (!res.ok) {
    const msg = data?.error || data?.message || raw?.slice(0, 200) || 'Unable to sign in.';
    return { ok: false, message: msg };
  }

  // read the data if we succeeded
  const ct = res.headers.get('content-type') || '';
  const raw = await res.text();            
  let data = null;
  if (ct.includes('application/json')) {
    try { data = JSON.parse(raw); } catch {}
  }

  // return the data
  return { ok: true, data };
}

/* Logout to destroy the embedkit session when the user logs out of the host application. */
async function logout() {
  boomiReady = null;
  // example server logout call to authService
  await serverLogout();
  DestroyPlugin({ removeHost: true, clearTheme: true, clearAuth: true });
}

/* Call to handle the server side logout base on the logic above.  */
async function serverLogout() {
  try {
    await fetch(`${import.meta.env?.VITE_SERVER_URL}/api/session`, {
       method: 'DELETE',
       credentials: 'include',
     });
  } catch {}
}

/* Uses the nonce from the server call above to intialize the plugin. This mints a JWT Token. */
async function initBoomiFromServer(res) {
  BoomiPlugin({
    serverBase: res.serverBase, // url of the Boomi partner api being used
    tenantId: res.tenantId, // parent account id 
    nonce: res.nonce, // nonce from embedkit
    boomiConfig: uiConfig, // the content of the boomi.config.js file
  });

  /* set the boomi ready flag to ensure we don't try to render 
  * a component before the plugin is fully initialized
  */
  boomiReady = new Promise((resolve) => requestAnimationFrame(resolve));
  return boomiReady;
}

/* Forces the wait for boomiReady  */
function runAfterBoomiReady(fn) {
  (boomiReady || Promise.resolve()).then(fn);
}

/* Used as a single function to render plugin components, utility with promise.  */
let __boomiRenderNonce = 0;
function renderBoomiComponent({ hostId, component, props = {} }) {
  __boomiRenderNonce += 1;
  runAfterBoomiReady(() =>
    RenderComponent({
      hostId, // in this example it would be 'boomi' 
      component, // the name of the component to render 'Integrations'
      props: { ...props, __refresh__: __boomiRenderNonce }, // any config props like componentKey
    })
  );
}

/* ----- Renders a dashboard widget with an embedkit component ----- */
function renderDashboard(node) {
  node.innerHTML = `
    <div id="boomi">
      <p>Load Integration History Here....</p>
    </div>
  `;
  const dashBoomi = el.qs('#boomi');
  if (dashBoomi) {
    renderBoomiComponent({
      hostId: 'boomi',
      component: 'Integrations',
      props: { componentKey: 'integration' },
    });
  }
}

```

## Authentication / Authorization 

EmbedKit leverages JWT authentication directly from the UI Components to the EmbedKit Server API. This 
requires CORS. In order to mint the JWT token the EmbedKit Server API must recieve validated Boomi Platform 
credentials as described above. If required you can install and configure the EmbedKit server locally within 
your environment. For more information please reach out to customer support or the Embedded team. 

EmbedKit assumes that your application will handle authenticating and authorizing your users prior to 
initializing the EmbedKit Plugin. We recommend you store all Boomi credentials within a encrypted data store
within your database and on your internal user's profile, and provide that information after successfully 
authenticating and authorizing your users first. 

### Context Flow

1. Your client facing web application should authenticate your users against your server endpoint. 
2. Once authenticated your server will construct the Boomi Payload as described herein. 
3. Your server will send an authentication request to the EmbedKit Server.
4. If authentication is successful the EmbedKit Server will respond with a one time HMAC Nonce. Note: The nonce has a 2 minute TLS. 
5. The nonce recieved should be returned to your Web Application Client. 
6. The EmbedKit Plugin should be initialized as defined herein, providing the nonce as one of the arguments.  
7. The EmbedKit Plugin will exchange the nonce for a JWT. Note: The token has a TLS of 10 minutes and all refreshes are handled automatically by the EmbedKit. 
8. The EmbedKit Server will mint the JWT and a RT Cookie. 
9. To render an EmbedKit Component you will call the provided RenderComponent method as described herein. 
10. If the user ends thier session on your Web Application Client please call auth/logout on the EmbedKit Server endpoint. 

---

## Rendering a component

Each EmbedKit component has a number for predefined configuration options that can be passed when the component is rendered. These options
are passed in via Properties. It is important to refer to the SDK to understand the available parameters 
for each component.

> [!NOTE]
> The properties available for each component vary and you should refer to the SDK. However, each component supports 
> the following:
>
> ```ts
>  @property {boolean} showTitle - Whether the component title should be displayed.
>  @property {string} [title] - Optional text for the component title.
>  @property {boolean} showDescription - Whether the component description should be displayed.
>  @property {string} [description] - Optional text for the component description.
> ```

Use the following to render the component. Note: the component will render within the div above:

```html
<div id='boomi'>{component will render here with full context}</div>
```

Leverage the following Javascript to render the component:

```js
import { RenderComponent } from '@boomi/embedkit';
  RenderComponent({ 
    targetId: 'boomi',                  // optional: override to target a different div than id="boomi" 
    component: 'Integrations',          // required: the name of the compnent to render
    props: { 
      componentKey: 'integrationsMain', // optional: configure more than one component of the same type
      } 
  });
```

---

## Styling & Theming Overview

The plugin maps these CSS variables to ready-made utility classes (e.g., .boomi-btn-primary, .boomi-input, .boomi-card) so your overrides cascade across all UI parts consistently.

## Built-in Themes (High Level)

| Theme  | Look & Feel Summary                                         | When to Use                                                     |
|--------|--------------------------------------------------------------|-----------------------------------------------------------------|
| `light` | Neutral, accessible light palette with subtle shadows.      | Standard web apps with light mode as the primary experience.    |
| `dark`  | High-contrast dark palette tuned for low-light environments.| Developer tools, dashboards, night-friendly apps.               |
| `boomi` | Boomi-branded accents and backgrounds, polished styling.    | When you want Boomi’s brand language out of the box.            |

You can:
- **Enable** theme switching for users.
- **Pick a default theme** at startup.
- **Create your own theme(s)** by defining CSS variables under `cssVarsByTheme` in `boomi.config.js`.

### `boomi.config.js` at a Glance

```js
// boomi.config.js
export default {
  enableAi: true,            // Enables AI features. You must provide the ai credentials during auth for these features to work. 
  theme: {
    allowThemes: true,       // let users or your app toggle themes
    defaultTheme: 'dark',    // 'light' | 'dark' | 'boomi' | '<your-custom>'
  },
  integrationsMain: {                               // default key for integrations component Note: you can create your own
    integrations: {                                 // integrations component
      title: 'My Integrations',                     // optional: title for the integrations page 
      description: 'This is a sample description',  // optional: description for the integrations page 
    }
  },
  
  // Define overrides per theme using CSS custom properties (design tokens)
  cssVarsByTheme: {
    // example custom theme
    cartoon: {
      '--boomi-root-bg-color': '#A0E8AF',
      '--boomi-btn-primary-bg': '#FFDE59',
      '--boomi-btn-primary-fg': '#2B2B2B',
      // ...any other design tokens you want to override
    },
  },
};
```

## Creating a Custom Theme
Define a new key under cssVarsByTheme and override any variables you need. The plugin’s CSS uses these tokens throughout buttons, inputs, cards, menus, tables, modals, wizards, mapping canvas, schedules, etc.

```js
// boomi.config.js (excerpt)
export default {
  theme: {
    allowThemes: true,
    defaultTheme: 'cartoon', // switch to your custom theme by default
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
That’s it—your theme will cascade across all plugin UI that uses the provided classes (like .boomi-btn-primary, .boomi-input, .boomi-card, etc.).

## How the Tokens Map to UI

The plugin’s stylesheet wires **CSS variables** → **utility classes** that you apply or the components use internally.

| UI Piece          | Class Example              | Core Tokens (examples) |
|-------------------|----------------------------|-------------------------|
| **Primary Button** | `.boomi-btn-primary`       | `--boomi-btn-primary-bg`, `--boomi-btn-primary-fg`, `--boomi-btn-primary-border`, `--boomi-btn-primary-shadow` |
| **Secondary Button** | `.boomi-btn-secondary`   | `--boomi-btn-secondary-bg`, `--boomi-btn-secondary-fg`, `--boomi-btn-secondary-border`, `--boomi-btn-secondary-shadow` |
| **Inputs**        | `.boomi-input`             | `--boomi-input-bg`, `--boomi-input-fg`, `--boomi-input-border`, `--boomi-input-shadow`, `--boomi-input-border-focus` |
| **Cards / Panels** | `.boomi-card`              | `--boomi-card-bg`, `--boomi-card-border`, `--boomi-card-shadow`, `--boomi-card-hover-shadow` |
| **Menus**         | `.boomi-menu` / `-item`    | `--boomi-menu-bg`, `--boomi-menu-fg`, `--boomi-menu-border`, `--boomi-menu-item-bg-hover` |
| **Modals**        | `.boomi-modal-*`           | `--boomi-modal-bg`, `--boomi-modal-fg`, `--boomi-modal-border`, `--boomi-modal-shadow` |
| **Notices / Alerts** | `.boomi-notice`          | `--boomi-notice-*-bg`, `--boomi-notice-*-fg`, `--boomi-notice-*-border`, `--boomi-notice-shadow` |
| **Wizard**        | `.boomi-wizard*`           | `--boomi-wizard-step-dot-*`, `--boomi-wizard-card-*`, `--boomi-wizard-link-*` |
| **Tables**        | `.boomi-table-*`           | `--boomi-table-header-*`, `--boomi-table-row-odd-bg`, `--boomi-table-row-even-bg` |
| **Mapping Canvas** | `.boomi-map-*`             | `--boomi-map-line`, `--boomi-map-card-*`, `--boomi-map-pin-*`, `--boomi-accent`, `--boomi-muted` |
| **Schedule UI**   | `.boomi-sched-*`           | `--boomi-sched-card-*`, `--boomi-sched-header-*`, `--boomi-sched-input-*`, `--boomi-sched-action-*` |

You can **override only the tokens you need**—everything else inherits from the active theme (`light`, `dark`, `boomi`, or your custom theme).

---

## Switching Themes at Runtime

If `theme.allowThemes = true`, your app can toggle by setting the plugin root’s data attribute:

```html
  <div id="boomi" data-theme="light"></div>
  <div id="boomi" data-theme="dark"></div>
  <div id="boomi" data-theme="boomi"></div>
  <div id="boomi" data-theme="cartoon"></div>
```

Or programmatically through your own theme switcher that updates the attribute on the host element that wraps the plugin.

If you don’t toggle themes at runtime, the plugin will use theme.defaultTheme from boomi.config.js.

## Tips

- Start with **`boomi`** for a polished look, then override a handful of tokens for brand alignment.  
- Keep contrast accessible—especially for **inputs**, **buttons**, and **table text**.  
- Scope overrides per theme in `cssVarsByTheme` so you can switch safely without leaking styles.  
- AI settings are optional—omit the `ai` block if you don’t use AI features.

---

## Agents

As of EmbedKit version 1.3.0 we have introduced the ability to run Boomi Agents as a special type of EmbedKit component. This feature
allows you to create agents in Boomi and expose them to your customers via the EmbedKit. 

### How to create an agent 

- In order to deploy an Agent to EmbedKit there are three process components that are required:
  * Agent Router - Depoloyed at the Parent Account level as a Web Server Listener. This process routes all inbound agent messages from EmbedKit to Boomi Agentic Flows. 
  * Agent Executor - The work horse of the solution, this is a sub-process deployed at the parent account level and handles all orchistration. 

1. Within Boomi you will create a Web Server Listener process at the parent account level. This will server as the router for all agent requests from
the EmbedKit. 
2. The start shape for that Boomi process should be configured as follows:
    * Operation Type: EXECUTE
    * Object: Agent
    * Expected Input Type: Multipart/form-data
    * Response Output Single JSON Object
    * Respose Profile (see below)
    * Attachment Cache (see belwo)
3. This process will require a Branch Shape directly after the start shape listner, it should have only 2 branches. 
    - In branch 1 you will leverage:
      * DataProcess shape with "Map Multipart From Data MIMEE to JSON set to the Document Cache configured below. 
      * Theb a Stop and Continue shape. 
    - In the second branch this is where the main processing will occur:
      * The first shape should be a Retrive From Document Cache Shape:
        * MIME Propertyt - Name: Static Value of "body".
      * From here you will define a Set Document Properties Shape:
        * Create properties for:
          * MIME Property - Mime Document
          * Dynamic Process Property - sessionId (from the request proffile)
          * Dynamic Process Property - message (from the request proffile)
          * Dynamic Process Property - integrationPackId (from the request proffile)
          * Dynamic Process Property - previousResponseId (from the request proffile)
      * The next shape is the heart of the Agent Router. Create a new Process Route shape. 
        * On the General tab, this shape will require two path names. We recommend "Success" and "Failure"
        * on the Process Routing tab, you will provide the mapping between Agents re: IntegrationPacks and Agent Executors. 
      

### Message Format (Request / Response Profiles within Boomi)

```json
{
  "sessionId": "9f78c9d0-6f8c-4d11-b2df-6a9f7e6c6a10", 
  "previousResponseId": "some_id",
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

### Agent Types 

The EmbedKit suports two type

---


## Resources

📚 **Documentation**: [Boomi EmbedKit Product Documentation](https://help.boomi.com/)  