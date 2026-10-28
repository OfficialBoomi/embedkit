# Boomi EmbedKit — Configuration Reference

This document is the complete reference for all user-facing configuration options in Boomi EmbedKit. It covers initialization, agent configuration, component configuration, theming, form customization, and every CSS design token available for styling.

> **New in 1.7:** the integrations list, Add Integration catalog, setup wizard, environment scope and their flags are explained end to end in the [Integrations Guide](./IntegrationsGuide.md).

---

## Table of Contents

1. [BoomiPlugin — Initialization Options](#1-boomiplugin--initialization-options)
2. [boomi.config.js — Top-Level Structure](#2-boomiconfigjs--top-level-structure)
3. [Theme Configuration](#3-theme-configuration)
4. [Agent Configuration](#4-agent-configuration)
5. [Component Configuration](#5-component-configuration)
6. [Form Configuration](#6-form-configuration)
7. [RenderComponent Options](#7-rendercomponent-options)
8. [CDN / window.BoomiEmbed Configuration](#8-cdn--windowboomiembed-configuration)
9. [CSS Design Tokens](#9-css-design-tokens)
10. [Events & Callbacks](#10-events--callbacks)
11. [Dialog Handlers](#11-dialog-handlers)

---

## 1. BoomiPlugin — Initialization Options

`BoomiPlugin()` is the main entry point for the npm/ESM integration path. Call it once after your server returns a nonce.

```js
import BoomiPlugin from '@boomi/embedkit';

BoomiPlugin({
  serverBase:  'https://your-embedkit-server.com/api/v1',
  tenantId:    'YOUR_BOOMI_PARENT_ACCOUNT_ID',
  nonce:       nonceFromServer,
  boomiConfig: uiConfig,
});
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `serverBase` | `string` | Yes | Base URL of the EmbedKit Server, e.g. `https://api.boomi.space/api/v1`. |
| `tenantId` | `string` | Yes | Your Boomi Parent Account ID. Used for CORS validation. |
| `nonce` | `string` | Conditional | One-time-use HMAC nonce from the EmbedKit auth endpoint. Required unless providing `accessToken`. |
| `accessToken` | `string` | Conditional | Pre-generated access token. Use instead of `nonce` for the public embed / CDN flow. |
| `boomiConfig` | `PluginUiConfig` | No | Full UI and behavior configuration. See [Section 2](#2-boomiconfigjs--top-level-structure). |
| `dialogHandlers` | `DialogHandlers` | No | Replaces EmbedKit's built-in confirm, alert, toast and session-ended dialogs with your own UI. See [Section 11](#11-dialog-handlers). |

---

### Environment scope (login body `environments`)

The login body your server posts to `POST /api/v1/auth/login` may carry `environments: string[]`. When present, **every** environment, instance and eligible-pack list for that tenant's sessions is limited to those environment ids: the environment dropdown shows only them, the integrations list shows only instances attached to at least one of them, and eligible packs report where they are installed within them. Omit it, or send an empty array, for all environments in the child account (the pre-1.7 behavior). Login rejects ids that are not environments of the child account with `422 Environment scope invalid: …`.

```js
const LOGIN_BODY = {
  url, parentAccountId, childAccountId, accountGroup, apiUserName, apiToken,
  environments: ['19f7dd46-d6e7-4ef4-a7aa-11373222ab6c'],   // optional session scope
  ai: { … },
  oauth2: { connections: {} },
};
```

Instances returned to the client now carry `environments: [{ id, name, classification }]`, every in-scope attachment, in addition to the legacy single `environmentId` (the first of them).

## 2. boomi.config.js — Top-Level Structure

`boomi.config.js` (or any JS/TS file you import) exports the `PluginUiConfig` object passed as `boomiConfig` to `BoomiPlugin()`.

```js
// boomi.config.js
export default {
  enableAi:       true,
  theme:          { ... },
  agents:         { ... },
  components:     { ... },
  form:           { ... },
  dialogs:        { ... },
  messages:       { ... },
  cssVars:        { ... },
  cssVarsByTheme: { ... },
  cssVarsByKey:   { ... },
  componentsByKey: { ... },
};
```

| Property | Type | Description |
|----------|------|-------------|
| `enableAi` | `boolean` | Enables AI features globally. AI credentials must be provided during server-side auth. |
| `theme` | `ThemeConfig` | Controls built-in theme selection and runtime theme switching. See [Section 3](#3-theme-configuration). |
| `agents` | `Record<agentId, AgentConfig>` | Per-agent configuration keyed by agent ID. See [Section 4](#4-agent-configuration). |
| `components` | `Record<componentKey, ComponentConfig>` | Per-component configuration keyed by `componentKey`. See [Section 5](#5-component-configuration). |
| `form` | `Record<string, FormConfig>` | Form field overrides for configurable dialogs. See [Section 6](#6-form-configuration). |
| `dialogs` | `DialogsConfig` | Structural options for callback (confirm/alert) dialogs — button order, icon visibility, destructive styling. See [Dialog Structural Options](#dialog-structural-options). |
| `messages` | `MessagesConfig` | Text overrides for shared messages. Today: `sessionEnded`, the message shown when the session has ended or timed out. See [Session-Ended Message](#session-ended-message). |
| `cssVars` | `Record<string, string>` | Global CSS variable overrides applied across all themes. |
| `cssVarsByTheme` | `Record<themeName, Record<string, string>>` | CSS variable overrides scoped to a specific theme. |
| `cssVarsByKey` | `Record<componentKey, Record<string, string>>` | CSS variable overrides scoped to a specific component instance key. |
| `componentsByKey` | `Record<componentKey, Record<string, boolean>>` | Feature flag overrides scoped to a specific component instance key. |

---

## 3. Theme Configuration

Passed as `boomiConfig.theme`.

```js
theme: {
  allowThemes:   true,
  defaultTheme:  'dark',
  darkModeTheme: false,
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `allowThemes` | `boolean` | `false` | Allows runtime theme switching via the `data-theme` attribute on the host element. |
| `defaultTheme` | `string` | `'boomi'` | Starting theme. Built-in values: `'light'`, `'dark'`, `'boomi'`. Pass any custom key defined in `cssVarsByTheme`. |
| `darkModeTheme` | `boolean` | `false` | When `true`, automatically applies the dark theme when the user's OS is in dark mode. |

### Built-in Themes

| Theme | Description |
|-------|-------------|
| `light` | Neutral light palette with subtle shadows. |
| `dark` | High-contrast dark palette for low-light environments. |
| `boomi` | Boomi-branded palette and styling out of the box. |

### Custom Themes

Define any additional key under `cssVarsByTheme` to create a custom theme:

```js
cssVarsByTheme: {
  'my-brand': {
    '--boomi-root-bg-color':   '#0f172a',
    '--boomi-btn-primary-bg':  '#2563eb',
    '--boomi-btn-primary-fg':  '#ffffff',
    // ... any tokens from Section 9
  },
},
```

Switch themes at runtime by setting `data-theme` on the host element:

```html
<div id="boomi" data-theme="my-brand"></div>
```

---

## 4. Agent Configuration

Passed as `boomiConfig.agents[agentId]`. Each key is the agent's ID.

```js
agents: {
  'my-agent-id': {
    environmentId: 'env-uuid',
    transport:     'boomi-direct',
    type:          'chat',
    position:      { corner: 'bottom-right', offsetX: 20, offsetY: 20 },
    label:         'Chat with AI',
    ui: {
      mode:    'modal',
      welcome: { title: 'Hello', subtitle: 'How can I help?' },
    },
  },
}
```

### Agent Root Properties

| Property | Type | Description |
|----------|------|-------------|
| `expandable` | `boolean` | When `true`, shows an expand/collapse button in the modal header (modal mode) and a collapse toggle on the sidebar. Allows users to stretch the modal to fill the screen and collapse/expand the chat history sidebar. |
| `environmentId` | `string` | Boomi environment ID to target for this agent. |
| `boomiAgentId` | `string` | The Boomi agent ID used when transport is `boomi-direct`. |
| `transport` | `'boomi-proxy' \| 'boomi-direct'` | Message routing strategy. `boomi-direct` sends messages directly to Boomi; `boomi-proxy` routes through the EmbedKit Server. Defaults to `boomi-proxy`. |
| `type` | `'chat' \| 'data'` | Agent interaction type. |
| `allowInstall` | `boolean` | When `true`, this agent appears in the install/add dropdown. |
| `installAsName` | `string` | Display name shown in the install dropdown. |
| `sendMultipartData` | `boolean` | Forces multipart/form-data for all requests (required when sending files). |
| `allowFreeTextPrompts` | `boolean` | Allows users to type free-form messages (in addition to preset prompts). |
| `label` | `string` | Text label shown on the floating launcher button. |
| `buttonLabel` | `string` | Label shown on agent cards in tile/list views. |
| `icon` | `string` | Emoji or short text shown as the launcher icon. |
| `hideIcon` | `boolean` | Hides the launcher icon entirely. |
| `shape` | `'circle' \| 'pill'` | Shape of the floating launcher button. |
| `position` | `UIPosition` | Position of the floating launcher. See [UIPosition](#uiposition) below. |
| `ui` | `AgentUiConfig` | All chat UI configuration. See [AgentUiConfig](#agentuiconfig) below. |
| `feedback` | `AgentFeedbackConfig` | Thumbs up / thumbs down / comment feedback on agent responses. See [Response Feedback](#response-feedback-feedback) below. |
| `form.configureAgent` | `FormConfig` | Custom form fields shown in the agent configuration dialog. |

### UIPosition

```js
// Corner-anchored with optional offset
position: { corner: 'bottom-right', offsetX: 20, offsetY: 20 }

// Absolute pixel position
position: { x: 100, y: 200 }
```

| Property | Type | Description |
|----------|------|-------------|
| `corner` | `'bottom-right' \| 'bottom-left' \| 'top-right' \| 'top-left'` | Anchor corner for the launcher button. |
| `offsetX` | `number` | Horizontal offset in pixels from the corner. |
| `offsetY` | `number` | Vertical offset in pixels from the corner. |
| `x` | `number` | Absolute X position in pixels (alternative to corner). |
| `y` | `number` | Absolute Y position in pixels (alternative to corner). |

### AgentUiConfig

Passed as `agents[id].ui`.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `mode` | `'modal' \| 'full'` | — | **Required.** `modal` renders the chat in a floating dialog. `full` renders it inline/full-page. |
| `sessionScope` | `'mount' \| 'multi'` | `'mount'` | Controls chat history persistence. `mount` resets the chat on every page load. `multi` preserves history across loads for the same browser session. |
| `welcome.title` | `string` | — | **Required.** Heading shown on the empty/welcome state screen. |
| `welcome.subtitle` | `string` | — | **Required.** Subheading shown on the empty/welcome state screen. |
| `allowFreeTextPrompt` | `boolean` | `true` | When `false`, only preset prompts are shown — the free-text input is hidden. |
| `fileAttachmentSupported` | `boolean` | `false` | Enables the file attachment button in the compose bar. |
| `fileAttachmentRequired` | `boolean` | `false` | When `true`, the user must attach at least one file before sending. |
| `allowedFileExtensions` | `string \| string[]` | — | Restricts accepted file types, e.g. `['.csv', '.json']` or `'.pdf'`. |
| `maxFiles` | `number` | — | Maximum number of files the user can attach per message. |
| `maxTotalBytes` | `number` | — | Maximum combined file size in bytes, e.g. `10 * 1024 * 1024` for 10 MB. |
| `prompts` | `Array<{ title: string; prompt: string }>` | — | Preset prompt cards shown on the welcome screen. Users click them to send the associated prompt. |
| `promptsAlign` | `'left' \| 'center' \| 'right'` | `'center'` | Horizontal alignment of the prompt card row. |
| `promptsLocation` | `'input' \| 'welcome'` | `'input'` | Where the prompt cards are rendered. `'input'` places them below the compose bar; `'welcome'` places them below the welcome title and subtitle. |

#### Suggested Prompts Example

```js
agents: {
  'my-agent-id': {
    ui: {
      mode: 'modal',
      welcome: { title: 'How can I help?', subtitle: 'Choose a topic or type your own question.' },

      // Prompt cards shown on the welcome screen
      prompts: [
        { title: 'Check process status',  prompt: 'What is the current status of my running processes?' },
        { title: 'Summarize recent errors', prompt: 'Summarize any errors from the last 24 hours.' },
        { title: 'Help me get started',   prompt: 'Walk me through how to set up a new integration.' },
      ],

      // 'left' | 'center' (default) | 'right'
      promptsAlign: 'center',

      // 'input' (default, below compose bar) | 'welcome' (below title + subtitle)
      promptsLocation: 'welcome',

      // Set to false to hide the free-text input and force users to use preset prompts only
      allowFreeTextPrompt: true,
    },
  },
},
```

> **Tip:** Set `allowFreeTextPrompt: false` together with `prompts` to create a guided, button-only interface where users can only select from the preset cards.

#### Page Header (full mode only)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `pageShowHeader` | `boolean` | `true` | Show or hide the top page header bar. |
| `pageShowTitle` | `boolean` | `true` | Show or hide the page title inside the header. |
| `pageTitle` | `string` | — | Override text for the page title. |
| `pageShowDescription` | `boolean` | `false` | Show a subtitle/description line below the title. |
| `pageDescription` | `string` | — | Text content for the page description line. |

#### Sidebar

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sidebar.show` | `boolean` | `false` | Show or hide the left sidebar panel. |
| `sidebar.width` | `number` | `300` | Sidebar width in pixels. |

#### Modal Sizing (modal mode only)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `modal.width` | `number` | `980` | Modal dialog width in pixels. |
| `modal.height` | `number` | `720` | Modal dialog height in pixels. |
| `modal.position` | `UIPosition` | — | Override the default centered position of the modal. |

---

### Response Feedback (`feedback`)

Adds thumbs up / thumbs down / comment controls under every agent response.
Feedback is delivered to **your application** as a standardized `'feedback'`
event — EmbedKit never sends it over the network itself. Your app subscribes
(see [Events & Callbacks](#10-events--callbacks)) and decides where the data
goes: your own backend, an analytics pipeline, a Boomi process, anywhere.

The feedback bar appears automatically on agent responses whenever a
programmatic subscriber is registered (`BoomiPlugin({ onEvent })` or
`BoomiEvents.on(...)`). No config is required. The optional `feedback` block
only customizes appearance and visibility:

```js
agents: {
  'my-agent-id': {
    ui: { /* ... */ },

    feedback: {
      // Each control is optional and individually configurable
      thumbsUp:   { show: true, icon: '👍', label: 'Good response' },
      thumbsDown: { show: true, icon: '👎', label: 'Bad response' },
      comment: {
        show: true,
        icon: '💬',
        placeholder: 'Tell us more about this response…',
        submitLabel: 'Send Feedback',
      },
      thanksText: 'Thanks for your feedback!',
    },
  },
},
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `enabled` | `boolean` | auto | Visibility override. Omitted: the bar shows when a programmatic subscriber exists. `true`: always show (required when listening **only** via the `boomi:event` DOM event, which cannot be auto-detected). `false`: never show. |
| `thumbsUp.show` | `boolean` | `true` | Show or hide the thumbs-up button. |
| `thumbsUp.icon` | `string` | built-in | Emoji or short text replacing the built-in thumbs-up icon. |
| `thumbsUp.label` | `string` | `'Good response'` | Tooltip / accessible label. |
| `thumbsDown.show` | `boolean` | `true` | Show or hide the thumbs-down button. |
| `thumbsDown.icon` | `string` | built-in | Emoji or short text replacing the built-in thumbs-down icon. |
| `thumbsDown.label` | `string` | `'Bad response'` | Tooltip / accessible label. |
| `comment.show` | `boolean` | `true` | Show or hide the comment button. |
| `comment.icon` | `string` | built-in | Emoji or short text replacing the built-in comment icon. |
| `comment.label` | `string` | `'Add a comment'` | Tooltip / accessible label. |
| `comment.placeholder` | `string` | `'Tell us more about this response…'` | Placeholder text inside the comment box. Style it with the `--boomi-agent-feedback-placeholder-*` tokens. |
| `comment.submitLabel` | `string` | `'Submit'` | Label on the comment submit button. |
| `comment.ariaLabel` | `string` | `'Feedback comment'` | Accessible (screen reader) name for the comment textarea. |
| `thanksText` | `string` | `'Thanks for your feedback!'` | Confirmation message shown after feedback is submitted. |

Clicking a thumb emits immediately; submitting a comment emits again with the
comment included alongside the current rating. Ratings are correctable:
clicking the **other** thumb switches the rating, and clicking the active
thumb again clears it (`rating: null`). Every correction emits a follow-up
event with the same `source.messageId`, so consumers should treat the
**latest event per message** as authoritative. See
[Feedback events](#feedback-events) for the exact event shape.

Styling is controlled by the `--boomi-agent-feedback-*` design tokens — see
[Response Feedback tokens](#response-feedback) under CSS Design Tokens.

---

## 5. Component Configuration

Passed as `boomiConfig.components[componentKey]`. Each key is the `componentKey` you pass to `RenderComponent`.

```js
components: {
  myIntegrations: {
    renderType:      'integration',
    uiVersion:       '1.7.0',
    showTitle:       true,
    title:           'My Integrations',
    showDescription: false,
  },
}
```

| Property | Type | Description |
|----------|------|-------------|
| `componentKey` | `string` | The unique key for this component instance. Must match what you pass as `props.componentKey` in `RenderComponent`. |
| `renderType` | `'agent' \| 'integration' \| 'all'` | Filters what is rendered in this component view. |
| `uiVersion` | `string` | The EmbedKit release whose UI this component has, e.g. `'1.7.0'`. Omit to keep the 1.6.1 UI. See [UI version](#ui-version-uiversion). |
| `showTitle` | `boolean` | Show or hide the component title. |
| `title` | `string` | Override text for the component title. |
| `showDescription` | `boolean` | Show or hide the component description. |
| `description` | `string` | Override text for the component description. |
| `mapping.useTreeMode` | `boolean` | When `true`, the mapping canvas uses tree view instead of the default layout. |

### UI version (`uiVersion`)

Upgrading EmbedKit never changes how an existing component looks. Each component renders the UI of the release named by its `uiVersion`, and a component without one keeps the **1.6.1** UI. To adopt a release's UI changes, set `uiVersion` to that release on the components you want to change, and test them before shipping:

```js
components: {
  myIntegrations: { renderType: 'integration', uiVersion: '1.7.0' },  // new UI
  myAgents:       { renderType: 'agent' },                              // unchanged: 1.6.1 UI
}
```

`uiVersion` only sets defaults. Any option you set explicitly wins, so you can adopt one feature without the rest (`showConnectors: true` on a 1.6.1 component), or keep one old behavior on a new one (`layout: 'form'` on a 1.7.0 component). Accepts `'1.7'`, `'1.7.0'` or `'v1.7.0'`; anything else logs a warning and uses 1.6.1. Bug fixes and new options that are off by default are not gated, so they reach every component.

| `uiVersion` | What changes |
|-------------|--------------|
| omitted, `'1.6.1'` or lower | The 1.6.1 UI. |
| `'1.7.0'` or higher | Add Integration opens the searchable catalog (`form.addIntegration.layout` defaults to `'catalog'`). Integration cards use the 1.7 layout (see [Integration cards](#integration-cards-integrationsintegration)): no type row, the actions menu at the top right, connector icons, a full-width environment row, and the card itself opens Edit. The list gets a filter beside the search box and sortable table columns with an Environment column (see [List filter and sorting](#list-filter-and-sorting)). Every scroll area uses thin scrollbars (see [Scrollbars](#scrollbars)). |

### Integration cards (`integrations.integration`)

Options for the cards on the main integrations list, under `components[componentKey].integrations.integration`. Defaults depend on the component's [`uiVersion`](#ui-version-uiversion).

```js
components: {
  myIntegrations: {
    renderType: 'integration',
    uiVersion: '1.7.0',
    integrations: {
      integration: {
        showType: false,                 // "Integration" / "Single Install Integration" row
        editButton: { show: false },     // false: clicking the card opens Edit instead
        showEnvironment: true,
        showConnectors: true,
      },
    },
  },
}
```

| Property | Type | Default before 1.7.0 | Default at 1.7.0+ | Description |
|----------|------|----------------------|-------------------|-------------|
| `showType` | `boolean` | `true` | `false` | Show the type row ("Integration" / "Single Install Integration") at the top of the card. |
| `editButton.show` | `boolean` | `true` | `false` | Show the **Edit** button on integration cards. When it is off, the whole card opens Edit on click, Enter or Space, and **Edit** becomes the first item in the actions menu; the menu itself never triggers the card. Agent cards always keep their **Run Agent** button. |
| `editButton.label` | `string` | `'Edit'` | `'Edit'` | Edit button text; also the start of the clickable card's accessible name ("Edit *Pack name*"). |
| `agentButton.label` | `string` | `'Run Agent'` | `'Run Agent'` | Run Agent button text on agent cards. |
| `showEdit` | `boolean` | `true` | `true` | `false` turns off editing from the card entirely: no Edit or Run Agent button, and the card is not clickable. |
| `showControls` | `boolean` | `true` | `true` | Show the actions (⋮) menu. |
| `showEnvironment` | `boolean` | `false` | `true` | Show the environment the instance is attached to (first in-scope environment, `+N` for more). An instance attached to no environment shows an orange **Unattached** pill instead, on the card and in the table. |
| `unattachedLabel` | `string` | `'Unattached'` | `'Unattached'` | Text of that pill. |
| `showConnectors` | `boolean` | `false` | `true` | Show the pack's connector icons under the description. The list asks the server for them only when this is on. |
| `connectorIconSize` | `number` | `36` | `36` | Connector icon art size in px. |

### List filter and sorting

At [`uiVersion`](#ui-version-uiversion) `'1.7.0'` or higher, a filter icon sits to the right of the search box on the integrations list and in the Add Integration catalog. It opens a panel of checkboxes: **Environment** (only when there are environments to choose from) and **Connector** (the connector types the packs use, with their icons). Picking several options in one group matches any of them; picking in both groups must match both. The icon shows how many filters are active, and **Clear filters** removes them. In the catalog, the environment filter keeps packs that are already installed in that environment.

The table view adds an **Environment** column (the first in-scope environment, `+N` for more) and sortable **Name**, **Description** and **Environment** headers: click once for ascending, again for descending, a third time for the default order. Filtering and sorting run on the server across the whole list before it is paged, and filter or sort changes return to page 1.

| Property | Type | Default before 1.7.0 | Default at 1.7.0+ | Description |
|----------|------|----------------------|-------------------|-------------|
| `integrations.filter.show` | `boolean` | `false` | `true` | Filter icon beside the list's search box. Also the catalog's default. |
| `form.addIntegration.catalog.filter.show` | `boolean` | follows `integrations.filter.show` | follows `integrations.filter.show` | Filter icon in the Add Integration catalog. |
| `integrations.table.sortable` | `boolean` | `false` | `true` | Sortable table headers. |
| `integrations.integration.showEnvironment` | `boolean` | `false` | `true` | Also controls the table's Environment column. |

Filter options are loaded the first time the panel opens (and again after the search changes). Tokens are listed under [List filter, sorting and tables](#list-filter-sorting-and-tables).

**Layout at 1.7.0+.** The actions menu moves to the right end of the top visible row: the type row when `showType` is on, otherwise the title row. The environment is a full-width row above the button, and the Edit or Run Agent button spans the full width. Before 1.7.0 the card keeps its original layout (menu and button at the bottom right, environment chip inline at the bottom left) whatever you set here.

### Pagination (`integrations.pagination`)

Options for the page controls of the integrations list, under `components[componentKey].integrations.pagination`. Every option is optional. With none set, the list shows 12 integrations per page and the controls sit below it, aligned to the right.

```js
components: {
  myIntegrations: {
    renderType: 'integration',
    integrations: {
      pagination: {
        position: 'top',            // 'top' | 'bottom' | 'sticky-top' | 'fixed-bottom'
        alignment: 'center',        // 'start' | 'center' | 'end'
        pageSize: 24,               // 1 to 30
        styles: {
          root:             { borderTop: '1px solid #e5e7eb' },
          pageButton:       { borderRadius: 6 },
          activePageButton: { fontWeight: 700 },
          input:            { width: 64 },
        },
      },
    },
  },
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `position` | `'top' \| 'bottom' \| 'sticky-top' \| 'fixed-bottom'` | `'bottom'` | Where the controls sit. `'top'` and `'bottom'` place them above or below the list. `'sticky-top'` and `'fixed-bottom'` keep them at the top or bottom edge of the EmbedKit area while the list scrolls. |
| `alignment` | `'start' \| 'center' \| 'end'` | `'end'` | Horizontal alignment of the controls. |
| `pageSize` | `number` | `12` | Integrations per page. A value below 1 becomes 1, a value above 30 becomes 30, and anything that is not a number is ignored. |
| `styles.root` | CSS object | none | Inline styles for the wrapper around all controls. |
| `styles.pageButton` | CSS object | none | Inline styles for every page number button. |
| `styles.activePageButton` | CSS object | none | Inline styles for the current page button, applied on top of `pageButton`. |
| `styles.input` | CSS object | none | Inline styles for the "Go to page" number input. |

An unknown `position` or `alignment` is ignored and the default is used.

**Keeping the controls in view.** `'sticky-top'` and `'fixed-bottom'` pin the controls to the edge of the EmbedKit area, not to the browser window, so they never cover your own page. They stay in view only when the element that holds EmbedKit has a fixed or maximum height, so that EmbedKit scrolls inside it. In a host that grows with its content, the page scrolls instead and the controls stay with the list. These two positions add a background (`--boomi-pagination-bg`, the page background by default) and 15px of vertical padding so the list does not show through. With `'fixed-bottom'`, EmbedKit also leaves room under the list so the last rows are not hidden.

**Styling the parts.** Each `styles` entry is a plain object of camelCase CSS properties, as in `{ backgroundColor: '#fff', borderRadius: 6 }`; a number means pixels for length properties. These styles win over the built-in styles and over the CSS variables below. Entries that are not a string or a number, and names that are not valid CSS property names, are ignored. Inline styles cannot express hover, focus or disabled states, and they do not follow a theme switch, so use the [pagination tokens](#pagination-tokens) for colors that should.

The Add Integration catalog keeps its own `form.addIntegration.catalog.pageSize`. Other lists in EmbedKit keep their fixed page sizes.

### Update Maps (`updateMaps`)

Options for the **Edit Map(s)** screen, under `components[componentKey].updateMaps`.

```js
components: {
  myIntegrations: {
    renderType: 'integration',
    updateMaps: {
      title: 'Map Fields',
      showDescription: true,
      showDefaultsNote: true,                 // default
      convertFunctionsToScript: false,        // default — opt in per host
    },
  },
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `showTitle` / `title` | `boolean` / `string` | `true` / `'Map Fields'` | Show or override the screen title. |
| `showDescription` / `description` | `boolean` / `string` | `true` / `'Please map fields below.'` | Show or override the description line. |
| `showDefaultsNote` / `defaultsNote` | `boolean` / `string` | `true` / built-in copy | Note explaining that removing a mapping restores the partner's default for that field. Defaults copied in at install are ordinary mappings, but the original still lives on the map component, so deleting the copy reverts rather than removes. |
| `allowAiEditor` | `boolean` | `true` | The Transformation Editor's **AI** editor: describe a transformation (with `enableAi`) and edit its JavaScript. |
| `allowFullEditor` | `boolean` | `false` | The Transformation Editor's **Editor**: pick a category and function (String, Math, Numeric, Date, Property, Language, Scripting), fill in its settings and input defaults, and test it where it can run locally. Custom Scripting takes JavaScript or Groovy; only JavaScript can be tested here. Platform-defined functions on the map open in the Editor as themselves, and a partner default you change is saved as your override. With both editors on the modal shows AI and Editor tabs; with one, no tabs; with neither, the AI editor. **Add** opens whichever is on. |
| `convertFunctionsToScript` | `boolean` | `false` | Let customers edit **platform-defined** functions (CurrentDate, TrimWhitespace, user-defined functions, …) by compiling them to a Custom Scripting function first. Off: those functions render with their connections, can be wired and deleted, and have no Edit action. On: convertible types gain Edit; choosing it compiles deterministically (no LLM), opens the Transformation Editor and emits `map.function.converted`; saving replaces the partner's function with the customer's script. Requires `embedkit-server` on `@boomi/embedkit-sdk` 1.4.0. See [Transformation Editor § 11](./TransformationEditor.md#11-editing-platform-defined-functions-convert-to-script). |

> **Default mappings arrive at install.** Since `@boomi/embedkit-sdk` 1.4.0 the server copies the publisher's default mappings and functions into a new instance's map extensions during install, so **Edit Map(s)** opens with them already drawn. The result is reported through the `map.defaults.seeded` event.

### Add Integration Catalog (`form.addIntegration`)

With [`uiVersion`](#ui-version-uiversion) `'1.7.0'` or higher, the Add Integration modal is a **catalog**: a search box over pack names, descriptions and connectors, a card or table view, and one card per eligible pack. Catalog cards use the same markup, width and title size as the main Integrations cards: the type on top when shown (**Integration** or **Single Install Integration**; `catalog.showType`), the pack name and description, a left-aligned stack of connector icons, a full-width "Installed in N environments" bar (when installed), and a full-width **Install** button (`catalog.installButton`). With the button off, clicking the card starts the install; the table view always shows the button. Installing opens the install step. The modal fits `--boomi-catalog-columns` cards across (default 3); on a narrower screen the cards shrink rather than drop a column, and on phones they stack. The environment list is the session's scoped list (see [Environment scope](#environment-scope-login-body-environments)); for **single-install** packs it also excludes environments that already hold the pack, preselects when exactly one remains, and disables install when none do.

```js
components: {
  myIntegrations: {
    renderType: 'integration',
    form: {
      addIntegration: {
        layout: 'catalog',                     // default at uiVersion 1.7.0+; 'form' (default before) is the dropdown form.
        catalog: { defaultView: 'grid', showViewToggle: true, searchPlaceholder: 'Search integrations or connectors' },
        showEnvironmentSelect: true,           // false: install into defaultEnvironmentId without asking
        defaultEnvironmentId: '…',
        allowDuplicateIntegrationNames: false,
        integrationPackName: { label: 'Integration Name', editable: true },
      },
    },
  },
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `layout` | `'catalog' \| 'form'` | `'catalog'` at `uiVersion` 1.7.0+, else `'form'` | Which Add Integration experience to render. |
| `catalog.defaultView` | `'grid' \| 'table'` | `'grid'` | Initial catalog layout. |
| `catalog.showViewToggle` | `boolean` | `true` | Show the card/table switch. |
| `catalog.installButton.show` | `boolean` | `true` | Show the **Install** button on catalog cards. When `false`, clicking the card (or Enter / Space) starts the install. The table view always shows the button. |
| `catalog.installButton.label` | `string` | `'Install'` | Button text, in both card and table views. |
| `catalog.showType` | `boolean` | `integrations.integration.showType` | Show the type line ("Integration" / "Single Install Integration") on catalog cards. Follows the main cards' setting unless set here, so it is off by default at `uiVersion` 1.7.0+. |
| `catalog.searchPlaceholder` | `string` | built-in | Search box placeholder. Search runs on the server when the user presses Enter. |
| `catalog.pageSize` | `number` | `12` | Packs per page (max 100). The catalog is paged on the server; connector icons are resolved only for the visible page. |
| `showTargetEnvironment` | `boolean` | `true` | Show "Installing into *Environment*" inside the selected card on the install step, including when the environment dropdown is hidden. Label text: `targetEnvironmentLabel` (default `'Installing into'`). |
| `hideEnvironmentSelectWhenSingle` | `boolean` | `false` | In the install step, hide the environment dropdown when exactly one environment is available (after the session scope and, for single-install packs, excluding environments that already hold the pack). That environment is used automatically. |

The remaining `form.addIntegration` keys below apply to both layouts.

**Connector icons** are the platform's own connector images, loaded from `https://<platform host>/connector/{connectorType}/icon/SVG` (the host is taken from the tenant's API URL; no authentication). For connector types where the platform only has a generic placeholder (Disk, FTP, SFTP, Database, LDAP, Mail and a few others) EmbedKit draws its own monochrome glyph instead, and any image that fails to load falls back to the glyph too. Tooltips show the connection name and the platform's connector label, which search also matches.

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `catalog.connectorIconSize` | `number` | `36` | Size of the icon art in px. Each icon sits in a rounded-square tile 16px larger (52px by default), centered. Cards show one centered, overlapping stack of up to four tiles (each tucked slightly under the next, left to right) at the same position on every card; with more connectors the fourth tile shows `+N`. |

> **Content Security Policy.** Host pages that restrict `img-src` must allow the platform host (for example `https://api.boomi.com`), or the icons fall back to glyphs. Tile tokens: `--boomi-connector-icon-tile` (tile size), `--boomi-connector-icon-radius` (default `0.5rem`), `--boomi-connector-icon-border`, `--boomi-connector-icon-bg`, `--boomi-connector-icon-image-bg` (behind platform images), `--boomi-connector-icon-fg` (glyph color), `--boomi-connector-icon-overlap` (how far tiles overlap, default `0.625rem`; `0` for side by side), `--boomi-connector-icon-ring` (separator ring, defaults to the card background) and `--boomi-connector-icon-solid-bg` (opaque tile base).

### Add Integration Form (`form.addIntegration`)

Configures the "Add Integration" install form for an integration component, under `components[componentKey].form.addIntegration`.

```js
components: {
  myIntegrations: {
    renderType: 'integration',
    form: {
      addIntegration: {
        allowDuplicateIntegrationNames: false,   // default — names must be unique
        showIntegrationPackSelect: true,
        showEnvironmentSelect: true,
        integrationPackName: { label: 'Integration Name', editable: true },
      },
    },
  },
}
```

| Property | Type | Description |
|----------|------|-------------|
| `allowDuplicateIntegrationNames` | `boolean` | When `false` or omitted (default), the integration name must be **unique** among already-installed integrations — the form blocks submission and shows an inline error on a duplicate. When `true`, users may install many integrations with the same name. |
| `showIntegrationPackSelect` | `boolean` | Show/hide the integration-pack selector. |
| `defaultIntegrationPackId` | `string` | Preselected pack id when the selector is hidden. |
| `showEnvironmentSelect` | `boolean` | Show/hide the environment selector. |
| `defaultEnvironmentId` | `string` | Preselected environment id when the selector is hidden. |
| `integrationPackSelect.label` / `.loadingMessage` | `string` | Copy for the pack selector. |
| `integrationPackName.label` / `.editable` / `.defaultIntegrationPackName` | `string` / `boolean` / `string` | Integration-name field options. |

### Modal Offset (per-component key)

You can also pass a `ModalOffsetConfig` under `boomiConfig.components` to nudge the default modal position for a component:

| Property | Type | Description |
|----------|------|-------------|
| `offsetX` | `number \| string` | Horizontal offset, e.g. `20` (px) or `'2rem'`. |
| `offsetY` | `number \| string` | Vertical offset, e.g. `20` (px) or `'2rem'`. |

---

## 6. Form Configuration

Passed as `boomiConfig.form` or within `agents[id].form`. Customizes field labels, placeholders, and styling for configurable dialogs.

```js
form: {
  configureAgent: {
    showTitle:   true,
    title:       'Configure Your Agent',
    apiKey: {
      label:       'API Key',
      placeholder: 'Enter your API key',
      inputMode:   'text',
    },
  },
}
```

### FormConfig

| Property | Type | Description |
|----------|------|-------------|
| `showTitle` | `boolean` | Show or hide the form title. |
| `title` | `string` | Override text for the form title. |
| `showDescription` | `boolean` | Show or hide the form description. |
| `description` | `string` | Override text for the form description. |
| `[fieldName]` | `FormInputConfig` | Per-field configuration — key is the field name in the form. |

### FormInputConfig

| Property | Type | Description |
|----------|------|-------------|
| `label` | `string` | Display label for the field. |
| `placeholder` | `string` | Placeholder text shown when the field is empty. |
| `validation` | `string` | Regex pattern for client-side validation. |
| `inputMode` | `'text' \| 'email' \| 'numeric' \| 'decimal' \| 'tel' \| 'url' \| 'search'` | HTML `inputmode` hint for mobile keyboards. |
| `wrapClass` | `string` | Extra CSS classes on the field wrapper element. |
| `labelClass` | `string` | Extra CSS classes on the `<label>` element. |
| `inputClass` | `string` | Extra CSS classes on the `<input>` element. |
| `helperClass` | `string` | Extra CSS classes on the helper text element. |
| `errorClass` | `string` | Extra CSS classes on the error message element. |
| `attrs` | `InputHTMLAttributes` | Additional HTML attributes passed directly to the `<input>` element (e.g. `maxLength`, `autoComplete`). |

### Connection Form Validation

Fields on the **connection form** (shown when a user adds or edits a connection) can be validated client-side with a regex pattern. These live under the reserved form key `connectorForm`, and each entry is keyed by the connection field's **`id`**. Its `validation` value is a regex string.

The pattern is compiled with `new RegExp(pattern)` and tested against the field's value on **blur** and again on **submit**. If it fails, the connection cannot be saved and an error message is shown beneath the field.

#### Example: a field that must be numeric and exactly 10 characters

```js
form: {
  connectorForm: {
    // key = the connection field's `id` (e.g. an account number field)
    accountNumber: {
      label:      'Account Number',
      inputMode:  'numeric',      // numeric keypad on mobile devices
      validation: '^[0-9]{10}$',  // exactly 10 digits — nothing more, nothing less
    },
  },
}
```

With `^[0-9]{10}$`, the field accepts only ten numeric characters: `1234567890` passes, while `123`, `12345678901`, and `12345abcde` are rejected and block saving.

**Notes**

- Write the regex **without** surrounding delimiters or flags — use `'^[0-9]{10}$'`, not `'/^[0-9]{10}$/'`.
- Validation runs on blur and on submit; any failing field blocks the save.
- The error text is fixed by the component (`is invalid.`, or `is required.` for an empty required field) and is not customizable through this config.
- Encrypted or secret fields (passwords, client secrets, access tokens) skip regex validation while left untouched, so this is intended for non-secret fields.
- The key must match the connection field's `id` — the same identifier the platform uses for that connector field.

---

## 7. RenderComponent Options

```js
import { RenderComponent } from '@boomi/embedkit';

RenderComponent({
  hostId:    'boomi',
  component: 'Integrations',
  props: {
    componentKey: 'myIntegrations',
  },
});
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `hostId` | `string` | No | ID of the DOM element to mount into. Defaults to `'boomi'`. |
| `component` | `string` | Yes | Name of the component to render. See table below. |
| `props` | `object` | No | Component-specific props. |
| `props.componentKey` | `string` | No | Unique key linking this render to a `boomiConfig.components` entry. Required when rendering more than one instance of the same component type. |

### Available Components

| Component | Description |
|-----------|-------------|
| `Integrations` | List, run, and monitor integration pack instances. |
| `Agent` | Single agent chat UI. Requires `props.integrationPackId`. |
| `AgentTiles` | Grid of agent cards. Requires `props.agentIds: string[]`. |
| `AgentListLauncher` | Floating launcher pill that opens a searchable agent list. Requires `props.agentIds: string[]`. |
| `RunAgent` | Trigger an agent run programmatically. |
| `ConfigureIntegration` | Configuration dialog for a specific integration. |
| `ExecutionHistory` | Integration execution log and history view. |
| `UpdateConnections` | Connection credential configuration UI. |
| `UpdateMaps` | Data mapping canvas UI. |
| `UpdateSchedules` | Process schedule configuration UI. |

---

## 8. CDN / window.BoomiEmbed Configuration

Used with the `@boomi/embedkit-cdn` UMD bundle. Set `window.BoomiEmbed` before the script loads, or call `BoomiPublicEmbed(config)` manually.

```html
<script>
  window.BoomiEmbed = {
    publicToken: 'pk_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    agentId:     'project_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    mountId:     'boomi-agent',
    serverBase:  'https://api.boomi.space/api/v1',
  };
</script>
```

| Property | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `publicToken` | `string` | Yes | — | The `pk_...` public token generated in the EmbedKit Admin Console. |
| `agentId` | `string` | Conditional | — | ID of a single agent to render. Required when `agentIds` is not provided. |
| `agentIds` | `string[]` | Conditional | — | Array of agent IDs for multi-agent views (tiles or list). Use instead of `agentId`. |
| `serverBase` | `string` | Yes | `'/api/v1'` | Base URL of the EmbedKit Server, e.g. `https://api.boomi.space/api/v1`. |
| `mountId` | `string` | No | `'boomi-agent'` | ID of the DOM element to mount the plugin into. |
| `origin` | `string` | No | `window.location.origin` | Origin sent for CORS validation. Overrides the browser-detected origin. |
| `userId` | `string` | No | — | Your application's identifier for this user. Used for session scoping and analytics. |
| `userToken` | `string` | No | — | Optional token for authenticated embed flows. |
| `config` | `object` | No | — | Additional configuration forwarded to the EmbedKit Server during session creation. Accepts a full `boomiConfig` object. |
| `autoInit` | `boolean` | No | `true` | When `true`, initializes automatically on page load from `window.BoomiEmbed`. Set to `false` to initialize manually. |
| `sessionScope` | `'mount' \| 'multi'` | No | `'mount'` | Chat session persistence. `mount` resets on each page load; `multi` preserves history across loads for the same browser session. |
| `dialogHandlers` | `DialogHandlers` | No | none | Replaces the built-in confirm, alert, toast and session-ended dialogs with your own UI. The agent chat delete confirmation is the one confirm dialog the CDN embed can raise, and the agent chat can also raise the session-ended message (`sessionError`). See [Section 11](#11-dialog-handlers). |

### CDN Embed Types

Configured in the EmbedKit Admin Console per project:

| Type | Description |
|------|-------------|
| `single` | Floating pill launcher that opens one agent in a modal. |
| `tiles` | Inline grid of agent cards — users pick and launch. |
| `list` | Floating pill launcher that opens a searchable agent list modal. |

---

## 9. CSS Design Tokens

All EmbedKit UI uses CSS custom properties (variables). Override them globally in `cssVars`, per-theme in `cssVarsByTheme`, or per-component-key in `cssVarsByKey`.

> **Styling scope.** EmbedKit renders inside a Shadow DOM, so CSS on the host page does not reach it. CSS variables are the supported way to customize appearance. EmbedKit does not currently expose `::part()` selectors or slots for host-page styling. Where a visual aspect (for example icon size or visibility) is not yet themeable, it is added as a token on request.

```js
cssVarsByTheme: {
  'my-theme': {
    '--boomi-btn-primary-bg': '#2563eb',
    '--boomi-agent-bg':       '#ffffff',
  },
},
```

---

### Brand & Page

| Token | Description |
|-------|-------------|
| `--boomi-font` | Font family applied throughout the plugin. |
| `--boomi-accent` | Global accent color used for highlights and indicators. |
| `--boomi-muted` | Muted/subdued text and border color. |
| `--boomi-danger` | Danger/destructive action color. |
| `--boomi-danger-bg` | Danger background. |
| `--boomi-danger-fg` | Danger foreground text. |
| `--boomi-danger-border` | Danger border. |
| `--boomi-danger-ring` | Danger focus ring. |
| `--boomi-danger-fg-hover` | Danger hover text color. |
| `--boomi-root-bg-color` | Outermost plugin background color. |
| `--boomi-root-bg-image` | Outermost plugin background image. |
| `--boomi-root-fg-color` | Outermost plugin foreground color. |
| `--boomi-page-bg-color` | Inner page background. |
| `--boomi-page-fg-color` | Inner page foreground text. |

---

### Buttons

#### Primary Button

| Token | Description |
|-------|-------------|
| `--boomi-btn-primary-bg` | Background |
| `--boomi-btn-primary-fg` | Text color |
| `--boomi-btn-primary-border` | Border |
| `--boomi-btn-primary-shadow` | Box shadow |
| `--boomi-btn-primary-bg-hover` | Hover background |
| `--boomi-btn-primary-fg-hover` | Hover text |
| `--boomi-btn-primary-border-hover` | Hover border |
| `--boomi-btn-primary-shadow-hover` | Hover shadow |
| `--boomi-btn-primary-bg-active` | Active/pressed background |
| `--boomi-btn-primary-fg-active` | Active text |
| `--boomi-btn-primary-border-active` | Active border |
| `--boomi-btn-primary-shadow-active` | Active shadow |

#### Secondary Button

| Token | Description |
|-------|-------------|
| `--boomi-btn-secondary-bg` | Background |
| `--boomi-btn-secondary-fg` | Text color |
| `--boomi-btn-secondary-border` | Border |
| `--boomi-btn-secondary-shadow` | Box shadow |
| `--boomi-btn-secondary-bg-hover` | Hover background |
| `--boomi-btn-secondary-fg-hover` | Hover text |
| `--boomi-btn-secondary-border-hover` | Hover border |
| `--boomi-btn-secondary-shadow-hover` | Hover shadow |
| `--boomi-btn-secondary-bg-active` | Active/pressed background |
| `--boomi-btn-secondary-fg-active` | Active text |
| `--boomi-btn-secondary-border-active` | Active border |
| `--boomi-btn-secondary-shadow-active` | Active shadow |

#### Success / Danger Buttons

| Token | Description |
|-------|-------------|
| `--boomi-success-bg` | Success button background |
| `--boomi-success-bg-hover` | Success button hover background |
| `--boomi-success-border` | Success button border |
| `--boomi-success-text` | Success button text |

---

### Inputs

| Token | Description |
|-------|-------------|
| `--boomi-input-bg` | Input background |
| `--boomi-input-fg` | Input text |
| `--boomi-input-border` | Input border |
| `--boomi-input-shadow` | Input box shadow |
| `--boomi-input-placeholder` | Placeholder text color |
| `--boomi-input-border-focus` | Border on focus |
| `--boomi-input-shadow-focus` | Shadow on focus |
| `--boomi-input-outline-focus` | Outline on focus |
| `--boomi-input-bg-disabled` | Disabled background |
| `--boomi-input-fg-disabled` | Disabled text |
| `--boomi-input-border-disabled` | Disabled border |
| `--boomi-input-border-invalid` | Invalid/error border |
| `--boomi-input-outline-invalid` | Invalid/error outline |
| `--boomi-search-clear-fg` | Clear (x) button icon color in search fields (defaults to the current text color) |
| `--boomi-search-clear-hover-fg` | Clear (x) button icon color on hover (defaults to `--boomi-search-clear-fg`) |

### Selects / Dropdowns

| Token | Description |
|-------|-------------|
| `--boomi-select-bg` | Select background |
| `--boomi-select-fg` | Select text |
| `--boomi-select-border` | Select border |
| `--boomi-select-shadow` | Select shadow |
| `--boomi-select-border-focus` | Focus border |
| `--boomi-select-shadow-focus` | Focus shadow |
| `--boomi-select-bg-disabled` | Disabled background |
| `--boomi-select-fg-disabled` | Disabled text |
| `--boomi-select-border-disabled` | Disabled border |
| `--boomi-select-border-invalid` | Invalid border |
| `--boomi-select-icon` | Dropdown arrow color |

### Form Labels

| Token | Description |
|-------|-------------|
| `--boomi-form-label-fg` | Label text color |
| `--boomi-form-required-fg` | Required field indicator color |
| `--boomi-form-helper-fg` | Helper/hint text color |
| `--boomi-form-error-fg` | Validation error message color |

---

### Modal

| Token | Description |
|-------|-------------|
| `--boomi-modal-bg` | Modal background |
| `--boomi-modal-fg` | Modal text |
| `--boomi-modal-border` | Modal border |
| `--boomi-modal-shadow` | Modal box shadow |
| `--boomi-modal-overlay-bg` | Backdrop/overlay color |
| `--boomi-modal-close-fg` | Close button color |
| `--boomi-modal-close-hover-fg` | Close button hover color |
| `--boomi-modal-offset-x` | Horizontal position offset (set programmatically) |
| `--boomi-modal-offset-y` | Vertical position offset (set programmatically) |
| `--boomi-modal-top-offset` | Top position offset |

---

### Agent Chat UI

#### Container & Layout

| Token | Description |
|-------|-------------|
| `--boomi-agent-bg` | Agent container background |
| `--boomi-agent-fg` | Agent text color |
| `--boomi-agent-border` | Agent border |
| `--boomi-agent-shadow` | Agent shadow |
| `--boomi-agent-radius` | Agent container border radius |
| `--boomi-agent-header-bg` | Header bar background |
| `--boomi-agent-header-border` | Header bar border |
| `--boomi-agent-pane-bg` | Side pane background |
| `--boomi-agent-pane-fg` | Side pane text |

#### Chat Area

| Token | Description |
|-------|-------------|
| `--boomi-agent-chat-bg` | Chat messages area background |
| `--boomi-agent-chat-border` | Chat area border |
| `--boomi-agent-chat-fg` | Chat area text |
| `--boomi-agent-thread-separator` | Color of the separator between message threads |

#### Message Bubbles

| Token | Description |
|-------|-------------|
| `--boomi-agent-bubble-user-bg` | User message bubble background |
| `--boomi-agent-bubble-user-fg` | User message text |
| `--boomi-agent-bubble-user-border` | User message border |
| `--boomi-agent-bubble-agent-bg` | Agent message bubble background |
| `--boomi-agent-bubble-agent-fg` | Agent message text |
| `--boomi-agent-bubble-agent-border` | Agent message border |
| `--boomi-agent-bubble-border` | General bubble border |
| `--boomi-agent-bubble-shadow` | General bubble shadow |

#### Compose Bar

| Token | Description |
|-------|-------------|
| `--boomi-agent-compose-bg` | Compose area background |
| `--boomi-agent-compose-border` | Compose area border |
| `--boomi-agent-compose-shadow` | Compose area shadow |
| `--boomi-agent-compose-input-bg` | Compose text input background |
| `--boomi-agent-compose-input-border` | Compose text input border |
| `--boomi-agent-compose-secondary-bg` | Secondary compose bar area background |
| `--boomi-agent-compose-secondary-border` | Secondary compose bar area border |

#### Composer Backdrop

The composer floats over the bottom of the scrolling conversation. The
**backdrop** is the panel painted behind the input so messages don't bleed
under it as they scroll. By default it renders as a soft transparent→solid
fade with no divider line, so the conversation gently dissolves into the input
area. All four tokens are overridable per-theme (`cssVarsByTheme`) or globally
(`cssVars`).

| Token | Default | Description |
|-------|---------|-------------|
| `--boomi-agent-composer-backdrop-bg` | `var(--boomi-agent-pane-bg)` | Solid color the backdrop panel resolves to. |
| `--boomi-agent-composer-backdrop-fade` | `2.5rem` | Height of the transparent→solid fade at the top edge. A value like `2.5rem` fades the conversation out into the backdrop; `0px` = a hard solid panel. |
| `--boomi-agent-composer-backdrop-line-width` | `0` | Thickness of the divider line at the top of the solid region. `0` = no line; set e.g. `1px` to show one. |
| `--boomi-agent-composer-backdrop-line-color` | `var(--boomi-agent-chat-border)` | Color of the divider line (only visible when the line width is `> 0`). |

**Two common looks:**

```js
// 1) Default — soft fade, no line (what ships out of the box).
//    The conversation gradually fades into the input area.
cssVars: {
  '--boomi-agent-composer-backdrop-bg': 'var(--boomi-agent-pane-bg)',
  '--boomi-agent-composer-backdrop-fade': '2.5rem',
  '--boomi-agent-composer-backdrop-line-width': '0',
}

// 2) Solid panel + a thin divider line — a hard panel that extends slightly
//    above the input, capped by a divider line.
cssVars: {
  '--boomi-agent-composer-backdrop-fade': '0px',
  '--boomi-agent-composer-backdrop-line-width': '1px',
  '--boomi-agent-composer-backdrop-line-color': 'var(--boomi-agent-chat-border)',
}
```

> Because `--boomi-agent-composer-backdrop-bg` defaults to the themed
> `--boomi-agent-pane-bg`, the backdrop automatically matches light, dark, and
> any custom theme without extra configuration. Override it only when you want
> the panel to differ from the pane background.

#### Tabs

| Token | Description |
|-------|-------------|
| `--boomi-agent-tab-bg` | Tab background |
| `--boomi-agent-tab-fg` | Tab text |
| `--boomi-agent-tab-border` | Tab border |
| `--boomi-agent-tab-bg-active` | Active tab background |
| `--boomi-agent-tab-fg-active` | Active tab text |
| `--boomi-agent-tab-border-active` | Active tab border |
| `--boomi-agent-tab-shadow-active` | Active tab shadow |

#### Sections, Cards & Text Blocks

| Token | Description |
|-------|-------------|
| `--boomi-agent-section-bg` | Section container background |
| `--boomi-agent-section-border` | Section container border |
| `--boomi-agent-section-fg` | Section text |
| `--boomi-agent-section-shadow` | Section shadow |
| `--boomi-agent-text-bg` | Text block background |
| `--boomi-agent-text-border` | Text block border |
| `--boomi-agent-text-fg` | Text block text |
| `--boomi-agent-text-copy-bg` | Code/text copy button background |
| `--boomi-agent-text-copy-bg-hover` | Copy button hover background |
| `--boomi-agent-text-copy-fg` | Copy button icon color |
| `--boomi-agent-card-tint` | Card tint overlay |
| `--boomi-agent-row-tint` | Row tint overlay |

#### Response Feedback

| Token | Description |
|-------|-------------|
| `--boomi-agent-feedback-fg` | Feedback bar text/icon color |
| `--boomi-agent-feedback-gap` | Gap between feedback controls |
| `--boomi-agent-feedback-margin-top` | Space between the response and the feedback bar |
| `--boomi-agent-feedback-icon-size` | Icon size inside the buttons |
| `--boomi-agent-feedback-btn-size` | Button width/height |
| `--boomi-agent-feedback-btn-radius` | Button border radius |
| `--boomi-agent-feedback-btn-bg` | Button background |
| `--boomi-agent-feedback-btn-fg` | Button icon color |
| `--boomi-agent-feedback-btn-border` | Button border |
| `--boomi-agent-feedback-btn-bg-hover` | Button hover background |
| `--boomi-agent-feedback-btn-bg-active` | Selected button background |
| `--boomi-agent-feedback-btn-fg-active` | Selected button icon color |
| `--boomi-agent-feedback-btn-border-active` | Selected button border |
| `--boomi-agent-feedback-up-fg-active` | Selected thumbs-up icon color |
| `--boomi-agent-feedback-down-fg-active` | Selected thumbs-down icon color |
| `--boomi-agent-feedback-comment-bg` | Comment textarea background |
| `--boomi-agent-feedback-comment-fg` | Comment textarea text |
| `--boomi-agent-feedback-comment-border` | Comment textarea border |
| `--boomi-agent-feedback-comment-radius` | Comment textarea border radius |
| `--boomi-agent-feedback-placeholder-fg` | Comment placeholder text color (defaults to `--boomi-input-placeholder`) |
| `--boomi-agent-feedback-placeholder-opacity` | Comment placeholder opacity (default `0.7`) |
| `--boomi-agent-feedback-placeholder-style` | Comment placeholder font style, e.g. `italic` (default `normal`) |
| `--boomi-agent-feedback-submit-bg` | Comment submit button background |
| `--boomi-agent-feedback-submit-fg` | Comment submit button text |
| `--boomi-agent-feedback-submit-border` | Comment submit button border |
| `--boomi-agent-feedback-submit-radius` | Comment submit button radius |
| `--boomi-agent-feedback-thanks-fg` | Thank-you message color |

#### Update Banner

| Token | Description |
|-------|-------------|
| `--boomi-agent-update-bg` | Update notification banner background |
| `--boomi-agent-update-fg` | Update banner text |
| `--boomi-agent-update-border` | Update banner border |
| `--boomi-agent-update-radius` | Update banner border radius |
| `--boomi-agent-update-shadow` | Update banner shadow |
| `--boomi-agent-update-title-fg` | Update banner title color |
| `--boomi-agent-update-desc-fg` | Update banner description color |
| `--boomi-agent-update-content-bg` | Update banner content area background |
| `--boomi-agent-update-content-fg` | Update banner content area text |

#### Close / Ring / Shimmer

| Token | Description |
|-------|-------------|
| `--boomi-agent-close-bg-hover` | Close button hover background |
| `--boomi-agent-close-fg` | Close button icon color |
| `--boomi-agent-close-hover-fg` | Close button icon hover color |
| `--boomi-agent-ring` | Focus ring / outline color |
| `--boomi-agent-blur` | Blur effect value |
| `--boomi-agent-shimmer-1` | Shimmer gradient color 1 (loading state) |
| `--boomi-agent-shimmer-2` | Shimmer gradient color 2 |
| `--boomi-agent-shimmer-angle` | Shimmer gradient angle |
| `--boomi-agent-shimmer-direction` | Shimmer animation direction |
| `--boomi-agent-shimmer-opacity` | Shimmer opacity |
| `--boomi-agent-shimmer-speed` | Shimmer animation duration |
| `--boomi-agent-row-shimmer-opacity` | Row-level shimmer opacity |

---

### Sidebar

| Token | Description |
|-------|-------------|
| `--boomi-sidebar-bg` | Sidebar background |
| `--boomi-sidebar-fg` | Sidebar text |
| `--boomi-sidebar-border` | Sidebar border |
| `--boomi-sidebar-header-bg` | Sidebar header background |
| `--boomi-sidebar-header-shadow` | Sidebar header shadow |
| `--boomi-sidebar-btn-bg` | Primary sidebar button background |
| `--boomi-sidebar-btn-fg` | Primary sidebar button text |
| `--boomi-sidebar-btn-border` | Primary sidebar button border |
| `--boomi-sidebar-btn-bg-hover` | Primary sidebar button hover |
| `--boomi-sidebar-secondary-btn-bg` | Secondary sidebar button background |
| `--boomi-sidebar-secondary-btn-fg` | Secondary sidebar button text |
| `--boomi-sidebar-secondary-btn-border` | Secondary sidebar button border |
| `--boomi-sidebar-secondary-btn-bg-hover` | Secondary sidebar button hover |

---

### Cards

| Token | Description |
|-------|-------------|
| `--boomi-card-bg` | Card background |
| `--boomi-card-fg` | Card text |
| `--boomi-card-border` | Card border |
| `--boomi-card-shadow` | Card shadow |
| `--boomi-card-radius` | Card border radius |
| `--boomi-card-hover-scale` | Scale transform on hover |
| `--boomi-card-hover-shadow` | Shadow on hover |

These shared tokens are the defaults for both card types below. Each card type also has its **own class and tokens**, so a host can restyle one without touching the other.

#### Integrations card (main list) — `.boomi-integration-card`

Keeps `.boomi-card` for its frame and hover. Parts: `__header`, `__type`, `__header-extra`, `__body`, `__content`, `__title-row`, `__title`, `__menu`, `__desc`, `__footer`, `__env-row`, `__actions`, `__edit`; modifiers `.boomi-integration-card--agent`, `--clickable` (card opens Edit) and `__footer--stacked` (1.7 layout). On a component before `uiVersion` 1.7.0 the defaults reproduce the 1.6.1 look exactly.

| Token | Default | Description |
|-------|---------|-------------|
| `--boomi-integration-card-bg` / `-fg` / `-border` / `-radius` / `-shadow` / `-hover-shadow` | shared `--boomi-card-*` | Frame of the main card only |
| `--boomi-integration-card-padding-x` | `1rem` | Horizontal padding of the type line |
| `--boomi-integration-card-header-padding` | `1rem 0 0 0` | Type row padding |
| `--boomi-integration-card-body-padding` | `1rem` | Title/description block padding |
| `--boomi-integration-card-type-fg` / `-font-size` / `-font-weight` | inherit / `0.875rem` / `400` | "Integration" / "Single Install Integration" line |
| `--boomi-integration-card-title-fg` / `-font-size` / `-font-weight` / `-line-height` | inherit / `1.25rem` (`1rem` at 1.7.0+) / `600` / `1.75rem` (`1.5rem` at 1.7.0+) | Title (single line, ellipsis) |
| `--boomi-integration-card-width` | `16rem` | 1.7.0+: card width, shared by the main list (`.boomi-integration-grid`, as many cards per row as fit) and the Add Integration catalog. Before 1.7.0 the list uses 1–4 stretched columns by screen width. |
| `--boomi-integration-grid-column-gap` / `-row-gap` | `1.5rem` / `2rem` | 1.7.0+: space between cards. |
| `--boomi-integration-card-desc-fg` / `-font-size` / `-line-height` / `-lines` | inherit / `0.75rem` / `1rem` / `2` | Description (clamped) |
| `--boomi-integration-card-actions-justify` / `-gap` / `-padding` | `flex-end` / `0.5rem` / `0.5rem` | Button row |
| `--boomi-integration-card-env-bg` / `-fg` / `-border` / `-radius` / `-padding` / `-font-size` / `-font-weight` | subtle tint / inherit / `0.375rem` / `0.1875rem 0.5rem` / `0.75rem` / `500` | Environment chip (`.boomi-integration-card__env`): a full-width row above the button at `uiVersion` 1.7.0+ (`__env-row`; `--boomi-integration-card-env-justify`, default `center`, and `--boomi-integration-card-env-row-padding`), otherwise at the bottom left of the button row; `data-classification="prod"\|"test"`, with `--boomi-integration-card-env-prod-bg` / `-test-bg`). Shows the first in-scope environment and `+N` for more; on by default at `uiVersion` 1.7.0+; set `integrations.integration.showEnvironment` to override. |
| `--boomi-integration-card-focus-ring` | accent | Focus outline of a clickable card (`--clickable`). |
| `--boomi-integration-card-title-row-gap` | `0.5rem` | Space between the title and the actions menu in the title row. |
| `--boomi-integration-card-env-justify` / `-env-row-padding` / `-env-row-chip-padding` | `center` / `0 0.5rem 0.5rem` / `0.3rem 0.5rem` | Full-width environment row (1.7 UI). |
| `--boomi-integration-card-env-unattached-bg` / `-fg` / `-border` | orange tint / `#c2410c` (`#fdba74` dark) / orange | **Unattached** pill (`.boomi-integration-card__env--unattached`) for instances attached to no environment. |
| `--boomi-integration-card-connectors-margin` / `-justify` | `0.75rem 0 0 0` / `flex-start` | Connector icon stack under the description (`.boomi-integration-card__connectors`, a `.boomi-connector-stack`). The description keeps a fixed height while icons are shown, so the stack sits at the same level on every card. On by default at `uiVersion` 1.7.0+; set `integrations.integration.showConnectors` to override. Icon size via `integrations.integration.connectorIconSize` (default `36`). |

#### Catalog card (Add Integration) — `.boomi-catalog-item` and `.boomi-catalog-card`

Cards in the catalog grid are Integrations cards (`.boomi-card.boomi-integration-card`, all `--boomi-integration-card-*` tokens apply) with the hook class `.boomi-catalog-item` and modifiers `--single`, `--multi`, `--installed`; the Install button is `.boomi-catalog-card__select` and the installed bar `.boomi-catalog-installed`. `.boomi-catalog-card` (tokens below) styles the selected pack on the install step (`--selected`), the Install button and the installed bar.

| Token | Default | Description |
|-------|---------|-------------|
| `--boomi-catalog-card-bg` / `-fg` / `-border` / `-border-width` / `-radius` / `-shadow` | shared `--boomi-card-*`, `1px` | Frame |
| `--boomi-catalog-card-padding` / `-gap` | `1rem` / `0.5rem` | Inner spacing |
| `--boomi-catalog-card-hover-transform` / `-hover-shadow` / `-hover-border` | `none` / frame values | Hover |
| `--boomi-catalog-card-selected-border` / `-selected-bg` | accent / frame bg | Selected card in the install step |
| `--boomi-catalog-card-type-fg` / `-font-size` / `-font-weight` / `-letter-spacing` | inherit / `0.875rem` / `400` / `normal` | Type line |
| `--boomi-catalog-card-title-fg` / `-font-size` / `-font-weight` / `-line-height` / `-lines` | inherit / `1rem` / `600` / `1.5` / `2` | Title (fixed height = lines × line height) |
| `--boomi-catalog-card-desc-fg` / `-font-size` / `-line-height` / `-lines` / `-opacity` | muted / `0.8rem` / `1.4` / `3` / `0.9` | Description (fixed height) |
| `--boomi-catalog-card-foot-gap` | `0.5rem` | Space between installed bar and button |
| `--boomi-catalog-target-env-bg` / `-fg` / `-border` / `-radius` / `-padding` / `-font-size` / `-name-weight` / `-label-opacity` | accent tint / inherit / accent border / `0.5rem` / `0.5rem 0.75rem` / `0.8125rem` / `600` / `0.75` | "Installing into" panel on the install step (`.boomi-catalog-card__target-env`, `__target-env-label`, `-name`, `-class`) |
| `--boomi-catalog-installed-bg` / `-fg` / `-border` / `-radius` / `-padding` / `-font-size` / `-font-weight` | success notice tokens / `0.375rem` / `0.3rem 0.5rem` / `0.75rem` / `500` | "Installed in N environments" bar |
| `--boomi-catalog-select-bg` / `-bg-hover` / `-fg` / `-border` / `-radius` / `-font-weight` / `-height` | primary button tokens / `600` / `2.25rem` | Full-width Select button |
| `--boomi-catalog-columns` | `3` | Cards per row; the modal is sized to fit them at `--boomi-integration-card-width`. |
| `--boomi-catalog-grid-gap` / `-padding` / `-max-height` | main grid gaps / `0.25rem` / `60vh` | Grid layout. Gaps fall back to `--boomi-integration-grid-column-gap` / `-row-gap`. |
| `--boomi-catalog-card-connectors-justify` | `flex-start` | Alignment of the connector icons on catalog cards (left, as on the main cards). |
| `--boomi-catalog-row-bg` / `-row-bg-hover`, `--boomi-catalog-table-icon-art` | inherit / `24px` | Table view rows (`.boomi-catalog-table__row`) and icon size |

Connector tiles use the `--boomi-connector-icon-*` tokens described under [Add Integration Catalog](#add-integration-catalog-formaddintegration).

| Token | Default | Description |
|-------|---------|-------------|
| `--boomi-catalog-search-min-width` | `12rem` | Minimum width of the catalog search box. |
| `--boomi-catalog-toolbar-gap` | `0.5rem` | Space between search, filter and the view toggle. |
| `--boomi-catalog-table-radius` / `-shadow` | `0.5rem` / small shadow | Catalog table frame. |
| `--boomi-catalog-table-cell-padding` | `0.75rem 1rem` | Header and cell padding in the catalog table. |
| `--boomi-catalog-table-th-font-size` / `-th-font-weight` / `-td-font-size` / `-name-font-weight` | `0.875rem` / `600` / `0.875rem` / `500` | Catalog table text. |

#### List filter, sorting and tables

The filter icon, sortable headers and tables on the integrations list (1.7 UI), plus the toolbar around the search box.

| Token | Default | Description |
|-------|---------|-------------|
| `--boomi-filter-size` / `-radius` | `2.5rem` / `0.5rem` | Filter icon button size and corners. |
| `--boomi-filter-bg` / `-fg` / `-border` / `-border-hover` | input tokens / inherit / input border / accent | Filter button colors. |
| `--boomi-filter-active-fg` | accent | Button color while filters are active. |
| `--boomi-filter-badge-bg` / `-badge-fg` | accent / primary button text | Active-filter count badge. |
| `--boomi-filter-panel-width` / `-panel-max-height` / `-panel-padding` | `16rem` / `22rem` / `0.625rem 0.75rem` | Filter panel (also uses the `--boomi-menu-*` colors). |
| `--boomi-filter-legend-font-size` / `-legend-opacity` / `-legend-fg` | `0.6875rem` / `0.7` / inherit | "Environment" and "Connector" group labels. |
| `--boomi-filter-option-font-size` / `-option-fg` | `0.8125rem` / inherit | Checkbox rows. |
| `--boomi-sort-icon-size` / `-icon-opacity` / `-active-fg` | `0.875em` / `0.35` / accent | Sort arrows on table headers; the active column's arrow uses `-active-fg`. |
| `--boomi-list-toolbar-gap` / `-toolbar-padding` | `0.5rem` / `1rem 0.5rem 1rem 0` | Search box, filter and add button row (`.boomi-list-search`). |
| `--boomi-list-search-padding` | `1rem 1.5rem 1rem 0` | Search box without the filter (1.6.1 layout). |
| `--boomi-integrations-table-radius` / `-shadow` | `0.5rem` / small shadow | Integrations table frame (`.boomi-integrations-table`). |
| `--boomi-integrations-table-th-padding-y` / `-th-font-size` / `-th-line-height` / `-th-font-weight` | `0.75rem` / `0.875rem` / `1.25rem` / `600` | Header cells. |
| `--boomi-integrations-table-td-padding-y` / `-td-font-size` / `-td-line-height` | `1rem` / `0.75rem` / `1rem` | Body cells. |
| `--boomi-integrations-table-td-padding-left` | `1rem`, `0.5rem` from 40rem wide | Left padding of the name and description cells. |
| `--boomi-integrations-table-text-max-width` | `24rem` | Maximum width of the name and description cells. |
| `--boomi-integrations-table-name-width` / `-description-width` / `-history-width` | `16.67%` / `100%` / `16.67%` | Column widths. |
| `--boomi-wizard-loading-padding` | `2.5rem` | Space around the loader while the setup wizard checks which steps to show. |

#### Pagination tokens

Colors of the page controls. They apply to every list that shows page controls. The options in [`integrations.pagination`](#pagination-integrationspagination) apply to the integrations list only.

| Token | Default | Description |
|-------|---------|-------------|
| `--boomi-pagination-text` | indigo 400 | Page numbers and the arrows. The next arrow keeps the button color unless this is set. |
| `--boomi-pagination-active-text` | indigo 500 | The current page number, and the arrows on hover. |
| `--boomi-pagination-active-bg` | indigo 100 | Background of the current page number. |
| `--boomi-pagination-label-text` | gray 700 | The "Go to page" label. |
| `--boomi-pagination-input-border` | the text color | Border of the "Go to page" input. |
| `--boomi-pagination-bg` | `--boomi-root-bg-color` | Background of the controls when `position` is `'sticky-top'` or `'fixed-bottom'`. |

---

### Header

| Token | Description |
|-------|-------------|
| `--boomi-header-bg` | Header background |
| `--boomi-header-fg` | Header text |
| `--boomi-header-border-color` | Header bottom border |
| `--boomi-header-shadow` | Header shadow |
| `--boomi-header-fg-hover` | Header link hover color |
| `--boomi-header-fg-active` | Header link active color |
| `--boomi-header-bg-color` | Alternate header background token |
| `--boomi-header-fg-color` | Alternate header text token |

---

### Tables

| Token | Description |
|-------|-------------|
| `--boomi-table-header-bg` | Column header background |
| `--boomi-table-header-fg` | Column header text |
| `--boomi-table-header-border` | Column header bottom border |
| `--boomi-table-row-odd-bg` | Odd row background |
| `--boomi-table-row-even-bg` | Even row background |
| `--boomi-table-row-hover-shadow` | Row shadow on hover |

---

### Menus

| Token | Description |
|-------|-------------|
| `--boomi-menu-bg` | Menu panel background |
| `--boomi-menu-fg` | Menu text |
| `--boomi-menu-border` | Menu border |
| `--boomi-menu-shadow` | Menu shadow |
| `--boomi-menu-radius` | Menu border radius |
| `--boomi-menu-font-size` | Menu font size |
| `--boomi-menu-item-bg` | Menu item background |
| `--boomi-menu-item-fg` | Menu item text |
| `--boomi-menu-item-bg-hover` | Menu item hover background |
| `--boomi-menu-item-fg-hover` | Menu item hover text |
| `--boomi-menu-item-outline` | Menu item focus outline |
| `--boomi-menu-item-radius` | Menu item border radius |
| `--boomi-menu-icon-opacity` | Menu icon opacity |
| `--boomi-menu-danger-fg` | Destructive menu item text |
| `--boomi-menu-danger-bg-hover` | Destructive menu item hover background |
| `--boomi-menu-danger-fg-hover` | Destructive menu item hover text |
| `--boomi-menu-divider` | Menu divider line color |

---

### Tabs (global)

| Token | Description |
|-------|-------------|
| `--boomi-tab-bg` | Tab background |
| `--boomi-tab-fg` | Tab text |
| `--boomi-tab-border` | Tab border |
| `--boomi-tab-bg-hover` | Tab hover background |
| `--boomi-tab-fg-hover` | Tab hover text |
| `--boomi-tab-border-hover` | Tab hover border |
| `--boomi-tab-bg-active` | Active tab background |
| `--boomi-tab-fg-active` | Active tab text |
| `--boomi-tab-border-active` | Active tab border |
| `--boomi-tablist-border` | Tab list container border |

### Transformation Editor (Editor tab)

Shown when `updateMaps.allowFullEditor` is on. When the AI editor is on too, the AI and Editor tabs use the global tab tokens above. Fields use the standard input, dropdown and button styles (`--boomi-input-*`, `--boomi-select-*`, `--boomi-btn-*`). Inputs are under form name `transformationEditor`, so `form.transformationEditor.<field>` overrides (label, placeholder, `wrapClass`, `inputClass`, …) apply to them; dropdowns take the tokens only, like every other dropdown. The tokens below cover the parts specific to the editor, and apply to both the AI and Editor tabs.

| Token | Description |
|-------|-------------|
| `--boomi-fn-editor-section-padding` | Section padding |
| `--boomi-fn-editor-section-bg` | Section background (falls back to `--boomi-update-content-bg`) |
| `--boomi-fn-editor-section-fg` | Section text (falls back to `--boomi-update-content-fg`) |
| `--boomi-fn-editor-section-border` | Section border (falls back to `--boomi-update-border`) |
| `--boomi-fn-editor-section-radius` | Section corner radius |
| `--boomi-fn-editor-heading-fg` | Section heading text |
| `--boomi-fn-script-border` | Script editor border (falls back to `--boomi-input-border`) |
| `--boomi-fn-script-border-error` | Script editor border when the script is missing (falls back to `--boomi-danger-border`) |
| `--boomi-fn-pins-border` | Inputs and Outputs panel border (falls back to `--boomi-update-border`) |
| `--boomi-fn-pins-border-error` | Panel border when no output is defined (falls back to `--boomi-danger-border`) |
| `--boomi-fn-pins-radius` | Inputs and Outputs panel corner radius |
| `--boomi-fn-pins-list-border` | Border around the input and output lists |
| `--boomi-fn-test-output-fg` | Test result text in the Test Output boxes |
| `--boomi-fn-pin-remove-fg` | Remove (delete) icon on an input or output |
| `--boomi-fn-pin-remove-fg-hover` | Remove icon on hover |

---

### Notices / Alerts

These tokens style every notice / alert surface — the `Notification` component, inline
status panels (e.g. execution details), and the modal error/info `Dialog`. State is
selected by the `boomi-notice--{state}` class (or a `data-variant` attribute), which maps
the generic `--boomi-notice-*` tokens to the matching per-state tokens below. Override the
per-state tokens to theme a single state, or the generic tokens to affect all of them.

#### Generic (shared) tokens

| Token | Description |
|-------|-------------|
| `--boomi-notice-bg` | Default notice background |
| `--boomi-notice-fg` | Default notice text |
| `--boomi-notice-border` | Default notice border |
| `--boomi-notice-icon` | Notice icon color |
| `--boomi-notice-radius` | Notice border radius |
| `--boomi-notice-shadow` | Notice shadow |
| `--boomi-notice-icon-opacity` | Notice icon opacity |
| `--boomi-notice-icon-size` | Notice icon width and height (default `1.25rem` for inline notices, `32px` for the modal `Dialog`) |
| `--boomi-notice-icon-display` | Set to `none` to hide the notice icon (default `inline`) |

#### Per-state tokens (`info` · `success` · `warning` · `error`)

| Token | Description |
|-------|-------------|
| `--boomi-notice-info-bg` / `-fg` / `-border` / `-icon` | Info notice background / text / border / icon |
| `--boomi-notice-success-bg` / `-fg` / `-border` / `-icon` | Success notice background / text / border / icon |
| `--boomi-notice-warning-bg` / `-fg` / `-border` / `-icon` | Warning notice background / text / border / icon |
| `--boomi-notice-error-bg` / `-fg` / `-border` / `-icon` | Error notice background / text / border / icon |

```js
cssVars: {
  // Theme just the error notice/alert state across the whole plugin
  '--boomi-notice-error-bg':     '#2b0d0d',
  '--boomi-notice-error-fg':     '#fecaca',
  '--boomi-notice-error-border': '#7f1d1d',
  '--boomi-notice-error-icon':   '#f87171',
},
```

---

### Status Indicators

Solid status colors used by compact indicators such as the execution-history timeline dots.
Each falls back to its built-in color when unset.

| Token | Description | Default |
|-------|-------------|---------|
| `--boomi-status-success` | Successful run | `#22c55e` |
| `--boomi-status-warning` | Warning / discarded run | `#facc15` |
| `--boomi-status-error` | Failed run | `#ef4444` |
| `--boomi-status-neutral` | No record / unknown | `#d1d5db` |

---

### Chips / Status Badges

| Token | Description |
|-------|-------------|
| `--boomi-chip-bg` | Default chip background |
| `--boomi-chip-fg` | Default chip text |
| `--boomi-chip-border` | Default chip border |
| `--boomi-chip-pulse-color` | Animated pulse color |
| `--boomi-chip-success-bg` | Success chip background |
| `--boomi-chip-success-fg` | Success chip text |
| `--boomi-chip-success-border` | Success chip border |
| `--boomi-chip-warning-bg` | Warning chip background |
| `--boomi-chip-warning-fg` | Warning chip text |
| `--boomi-chip-warning-border` | Warning chip border |
| `--boomi-chip-error-bg` | Error chip background |
| `--boomi-chip-error-fg` | Error chip text |
| `--boomi-chip-error-border` | Error chip border |

---

### Connections

| Token | Description |
|-------|-------------|
| `--boomi-conn-bg` | Connection panel background |
| `--boomi-conn-border` | Connection panel border |
| `--boomi-conn-field-bg` | Field background |
| `--boomi-conn-field-border` | Field border |
| `--boomi-conn-field-label-fg` | Field label text |
| `--boomi-conn-field-error-fg` | Field error text |
| `--boomi-conn-heading-fg` | Panel heading text |
| `--boomi-conn-btn-auth-bg` | Auth button background |
| `--boomi-conn-btn-auth-fg` | Auth button text |
| `--boomi-conn-btn-save-bg` | Save button background |
| `--boomi-conn-btn-save-fg` | Save button text |
| `--boomi-conn-btn-disabled-bg` | Disabled button background |
| `--boomi-conn-btn-disabled-fg` | Disabled button text |

---

### Mapping Canvas

| Token | Description |
|-------|-------------|
| `--boomi-map-bg` | Canvas background |
| `--boomi-map-fg` | Canvas text |
| `--boomi-map-heading-fg` | Heading text |
| `--boomi-map-line` | Connection line color |
| `--boomi-map-line-width` | Connection line stroke width |
| `--boomi-map-line-highlight` | Highlighted line color |
| `--boomi-map-line-dim` | Dimmed line opacity |
| `--boomi-map-line-filter` | SVG filter on lines |
| `--boomi-map-card-bg` | Mapping card background |
| `--boomi-map-card-border` | Mapping card border |
| `--boomi-map-card-shadow` | Mapping card shadow |
| `--boomi-map-card-shadow-hover` | Mapping card hover shadow |
| `--boomi-map-card-transform-hover` | Mapping card hover transform |
| `--boomi-map-source-bg` | Source card background |
| `--boomi-map-source-bg-mapped` | Source card background when mapped |
| `--boomi-map-source-border-mapped` | Source card border when mapped |
| `--boomi-map-source-outline` | Source card outline when selected |
| `--boomi-map-target-bg` | Target card background |
| `--boomi-map-target-bg-mapped` | Target card background when mapped |
| `--boomi-map-target-border-mapped` | Target card border when mapped |
| `--boomi-map-target-outline` | Target card outline when selected |
| `--boomi-map-func-bg` | Function node background |
| `--boomi-map-func-fg` | Function node text |
| `--boomi-map-func-title-fg` | Function node title |
| `--boomi-map-func-subtle-fg` | Function node subdued text |
| `--boomi-map-func-outline` | Function node outline |
| `--boomi-map-pin-source-bg` | Source pin background |
| `--boomi-map-pin-source-border` | Source pin border |
| `--boomi-map-pin-target-bg` | Target pin background |
| `--boomi-map-pin-target-border` | Target pin border |
| `--boomi-map-pin-input-bg` | Input pin background |
| `--boomi-map-pin-input-border` | Input pin border |
| `--boomi-map-pin-output-bg` | Output pin background |
| `--boomi-map-pin-output-border` | Output pin border |
| `--boomi-map-pin-output-bg-active` | Active output pin background |
| `--boomi-map-pin-output-border-active` | Active output pin border |
| `--boomi-map-pin-danger-bg` | Danger/error pin background |
| `--boomi-map-pin-badge-bg` | Pin badge background |
| `--boomi-map-pin-badge-fg` | Pin badge text |
| `--boomi-map-pin-mappable-opacity` | Opacity of mappable (available) pins |
| `--boomi-map-pin-active-opacity` | Opacity of active pins |
| `--boomi-map-pin-anim` | Pin animation |
| `--boomi-map-pulse-color` | Pulse animation color |
| `--boomi-map-pulse-border` | Pulse animation border |
| `--boomi-map-add-bg` | Add/insert button background |
| `--boomi-map-add-fg` | Add button text |
| `--boomi-map-add-border` | Add button border |
| `--boomi-map-add-shadow` | Add button shadow |
| `--boomi-map-add-bg-hover` | Add button hover background |
| `--boomi-map-add-fg-hover` | Add button hover text |
| `--boomi-map-add-border-hover` | Add button hover border |
| `--boomi-map-add-shadow-hover` | Add button hover shadow |

#### Mapping canvas search — `.boomi-map-search`

The search row above **Sources**, **Transformations** and **Targets** (`.boomi-map-search`, `.boomi-map-search-nav`, `.boomi-map-search-btn`, `.boomi-map-search-count`). Matching cards get `.is-search-hit`; the current one also gets `.is-current-hit`.

| Token | Description |
|-------|-------------|
| `--boomi-map-search-gap` | Gap between the search box and Prev / Next (default `0.5rem`) |
| `--boomi-map-search-margin-top` | Space above the row (default `0.5rem`) |
| `--boomi-map-search-nav-gap` | Gap between Prev, the count and Next (default `0.25rem`) |
| `--boomi-map-search-nav-font-size` | Count text size (default `0.75rem`) |
| `--boomi-map-search-nav-fg` | Count text color |
| `--boomi-map-search-btn-padding` | Prev / Next padding (default `2px 6px`) |
| `--boomi-map-search-btn-font-size` | Prev / Next text size (default `11px`) |
| `--boomi-map-search-btn-fg` | Prev / Next text color |
| `--boomi-map-search-btn-bg` | Prev / Next background (default transparent) |
| `--boomi-map-search-btn-border` | Prev / Next border color (default `currentColor`) |
| `--boomi-map-search-btn-radius` | Prev / Next corner radius (default `0.25rem`) |
| `--boomi-map-search-btn-disabled-opacity` | Prev / Next opacity with no results (default `1`) |
| `--boomi-map-search-count-min-width` | Width reserved for "1 / 3" (default `56px`) |
| `--boomi-map-search-hit-outline` | Outline of matching cards (default `#ff9800`; falls back to `--hit-outline`) |
| `--boomi-map-search-hit-current` | Ring around the current match (default `#ffb74d`; falls back to `--hit-current`) |
| `--boomi-map-search-hit-outline-dark` | Matching-card outline under `.dark` (default `#ffd400`) |
| `--boomi-map-search-hit-current-dark` | Current-match ring under `.dark` (default `#ffe266`) |

---

### Schedules

| Token | Description |
|-------|-------------|
| `--boomi-schedule-bg` | Schedule panel background |
| `--boomi-schedule-fg` | Schedule text |
| `--boomi-schedule-border` | Schedule panel border |
| `--boomi-schedule-shadow` | Schedule panel shadow |
| `--boomi-schedule-title-fg` | Schedule title color |
| `--boomi-sched-header-bg` | Schedule header background |
| `--boomi-sched-header-fg` | Schedule header text |
| `--boomi-sched-header-border` | Schedule header border |
| `--boomi-schedule-btn-bg` | Schedule button background |
| `--boomi-schedule-btn-fg` | Schedule button text |
| `--boomi-schedule-btn-border` | Schedule button border |
| `--boomi-schedule-btn-bg-hover` | Schedule button hover |
| `--boomi-schedule-btn-bg-active` | Schedule button active/pressed |
| `--boomi-schedule-input-bg` | Schedule input background |
| `--boomi-schedule-input-fg` | Schedule input text |
| `--boomi-schedule-input-border` | Schedule input border |
| `--boomi-schedule-input-bg-disabled` | Disabled input background |
| `--boomi-schedule-input-fg-disabled` | Disabled input text |
| `--boomi-schedule-input-border-disabled` | Disabled input border |
| `--boomi-schedule-input-border-focus` | Input focus border |
| `--boomi-schedule-accordion-bg` | Accordion background |
| `--boomi-schedule-accordion-border` | Accordion border |
| `--boomi-schedule-content-fg` | Schedule content text |

---

### Wizard / Stepper

| Token | Description |
|-------|-------------|
| `--boomi-wizard-card-bg` | Wizard card background |
| `--boomi-wizard-card-fg` | Wizard card text |
| `--boomi-wizard-card-border` | Wizard card border |
| `--boomi-wizard-card-shadow` | Wizard card shadow |
| `--boomi-wizard-step-dot-bg` | Step indicator dot background |
| `--boomi-wizard-step-dot-fg` | Step indicator dot text |
| `--boomi-wizard-step-dot-border` | Step indicator dot border |
| `--boomi-wizard-step-dot-shadow` | Step indicator dot shadow |
| `--boomi-wizard-step-dot-bg-active` | Active step dot background |
| `--boomi-wizard-step-dot-fg-active` | Active step dot text |
| `--boomi-wizard-step-dot-border-active` | Active step dot border |
| `--boomi-wizard-step-dot-shadow-active` | Active step dot shadow |
| `--boomi-wizard-step-dot-bg-completed` | Completed step dot background |
| `--boomi-wizard-step-dot-fg-completed` | Completed step dot text |
| `--boomi-wizard-step-dot-border-completed` | Completed step dot border |
| `--boomi-wizard-step-dot-shadow-completed` | Completed step dot shadow |
| `--boomi-wizard-connector-bg` | Connector line between steps |
| `--boomi-wizard-connector-shadow` | Connector shadow |
| `--boomi-wizard-label-fg` | Step label text |
| `--boomi-wizard-link-fg` | Link color |
| `--boomi-wizard-link-fg-hover` | Link hover color |
| `--boomi-wizard-link-strong-fg` | Strong link color |

---

### Options / Typeahead

| Token | Description |
|-------|-------------|
| `--boomi-options-bg` | Options dropdown background |
| `--boomi-options-fg` | Options dropdown text |
| `--boomi-options-border` | Options dropdown border |
| `--boomi-options-shadow` | Options dropdown shadow |
| `--boomi-options-search-bg` | Search input background within dropdown |
| `--boomi-options-searchable-max-height` | List height when the dropdown has a search box (default `15rem`) |
| `--boomi-options-search-input-padding` | Search input padding (default `0.25rem 0.5rem`) |
| `--boomi-options-search-input-radius` | Search input corner radius (default `0.375rem`) |
| `--boomi-options-search-input-font-size` | Search input text size (default `0.875rem`) |
| `--boomi-option-bg` | Individual option background |
| `--boomi-option-fg` | Individual option text |
| `--boomi-option-bg-active` | Keyboard-active option background |
| `--boomi-option-fg-active` | Keyboard-active option text |
| `--boomi-option-bg-selected` | Selected option background |
| `--boomi-option-fg-selected` | Selected option text |
| `--boomi-option-fg-placeholder` | Placeholder option text |

---

### Loading & Spinners

| Token | Description |
|-------|-------------|
| `--boomi-loader-dot-size` | Dot loader size |
| `--boomi-loader-dot-bg` | Dot loader color |
| `--boomi-loader-dot-opacity` | Dot loader opacity |
| `--boomi-loader-dot1-opacity` | Individual dot 1 opacity |
| `--boomi-loader-dot2-opacity` | Individual dot 2 opacity |
| `--boomi-loader-dot3-opacity` | Individual dot 3 opacity |
| `--boomi-loader-msg-fg` | Loader message text color |
| `--boomi-spinner-size` | Spinner diameter |
| `--boomi-spinner-border-width` | Spinner stroke width |
| `--boomi-spinner-ring-color` | Spinner ring color |
| `--boomi-spinner-ping-color` | Spinner ping/pulse color |
| `--boomi-spinner-ping-opacity` | Spinner ping opacity |
| `--boomi-spinner-message-fg` | Spinner message text color |
| `--boomi-spinner-overlay-bg` | Full-page overlay background |
| `--boomi-spinner-overlay-blur` | Full-page overlay blur |
| `--boomi-spinner-overlay-contained-bg` | Contained overlay background |
| `--boomi-spinner-overlay-contained-blur` | Contained overlay blur |

---

### Scrollbars

| Token | Description |
|-------|-------------|
| `--boomi-scrollbar-width` | Scrollbar width |
| `--boomi-scrollbar-bg` | Scrollbar track background |
| `--boomi-scrollbar-thumb` | Scrollbar thumb color |
| `--boomi-scrollbar-thumb-hover` | Scrollbar thumb hover color |
| `--boomi-scrollbar-thumb-active` | Scrollbar thumb active color |
| `--boomi-scrollbar-corner` | Scrollbar corner color |
| `--boomi-scrollbar-radius` | Scrollbar thumb border radius |
| `--boomi-scrollbar-thumb-inset` | Transparent padding around the thumb (`3px` on the 1.6.1 UI, `2px` at `uiVersion` 1.7.0+; visible thumb = width − 2 × inset) |
| `--boomi-scrollbar-thumb-inset-hover` | Inset on hover (`2px` on the 1.6.1 UI, `1px` at 1.7.0+, so the thumb grows slightly) |
| `--boomi-scrollbar-firefox-width` | Firefox `scrollbar-width` at 1.7.0+ (`thin` default, `auto`, `none`) |

#### Scrollbars

On the 1.6.1 UI these tokens style elements with `.boomi-scroll` (`10px` track, tinted background). At [`uiVersion`](#ui-version-uiversion) `'1.7.0'` or higher, **every scroll area in the component** uses them, with thinner defaults: `8px` track, transparent background, a 4px pill thumb that grows to 6px and takes the accent tint on hover. The rules stay inside the component's shadow root, so they never affect the host page, and tokens you set in `cssVars` override these defaults. `.boomi-scroll`, `.is-slim` and `.is-ultraslim` still work for per-element tuning.

---

### Connector Details

| Token | Description |
|-------|-------------|
| `--boomi-connector-bg` | Connector panel background |
| `--boomi-connector-fg` | Connector panel text |
| `--boomi-connector-inner-bg` | Inner area background |
| `--boomi-connector-inner-border` | Inner area border |
| `--boomi-connector-radius` | Panel border radius |
| `--boomi-connector-shadow` | Panel shadow |
| `--boomi-connector-title-fg` | Title text color |
| `--boomi-connector-subtle-fg` | Subdued/muted text |

---

### SweetAlert Dialogs

Confirm/alert dialogs render on `document.body`, outside the plugin's Shadow DOM, so EmbedKit resolves the active `--boomi-swal-*` values from the host and re-declares them in document scope automatically, the same mechanism as Toast Notifications below. Override these like any other token: globally in `cssVars`, per-theme in `cssVarsByTheme`, or per-component-key in `cssVarsByKey`.

> To replace these dialogs with your own UI (for example a `MatDialog`), register a [dialog handler](#11-dialog-handlers). Everything below styles EmbedKit's built-in dialog, which is what a user sees when no handler is registered.

| Token | Description | Default |
|-------|-------------|---------|
| `--boomi-swal-bg` | Dialog background | theme modal background |
| `--boomi-swal-fg` | Dialog text | theme modal text |
| `--boomi-swal-border` | Dialog border | theme modal border |
| `--boomi-swal-shadow` | Dialog shadow | theme modal shadow |
| `--boomi-swal-title-fg` | Dialog title color | theme heading color |
| `--boomi-swal-desc-fg` | Dialog description color | theme body text color |
| `--boomi-swal-overlay-bg` | Overlay/backdrop color behind the dialog | theme overlay color |
| `--boomi-swal-icon-success` | Success-type icon color | theme success color |
| `--boomi-swal-icon-warning` | Warning-type icon color | theme warning color |
| `--boomi-swal-icon-error` | Error-type icon color | theme danger color |
| `--boomi-dialog-font` | Font family for dialog title, body, and buttons (shared with Toast Notifications) | `--boomi-font` (the embed's overall font) |
| `--boomi-swal-title-font-size` | Title font size | `1.125rem` |
| `--boomi-swal-title-font-weight` | Title font weight | `700` |
| `--boomi-swal-desc-font-size` | Description font size | `0.95rem` |
| `--boomi-swal-border-radius` | Dialog corner radius | `1rem` |
| `--boomi-swal-padding` | Dialog inner padding | `1.25rem` |
| `--boomi-swal-actions-gap` | Gap between confirm/cancel buttons | `0.5rem` |

Confirm/cancel buttons use the same `--boomi-btn-primary-*` / `--boomi-btn-secondary-*` tokens as the rest of the embed (see [Buttons](#buttons)); the destructive confirm-button variant (see **Dialog Structural Options** below) uses a parallel `--boomi-btn-danger-*` family, defaulted to the shared `--boomi-danger` token. Success/warning/error icon colors fall back to the shared `--boomi-notice-*-fg` tokens (see [Notices / Alerts](#notices--alerts)) if set and `--boomi-swal-icon-*` is not.

> **Fixed in this release:** `--boomi-swal-title-fg`, `--boomi-swal-desc-fg`, `--boomi-swal-overlay-bg`, `--boomi-swal-icon-success`, `--boomi-swal-icon-warning`, and `--boomi-swal-icon-error` were documented here previously but had no effect — the dialog CSS read different legacy variable names instead. They are now wired correctly (falling back to those legacy names if you were already relying on them, so existing configs are unaffected). A separate hardcoded `rgba(0,0,0,0.9)` override on `--boomi-swal-bg` that could silently beat your theme's value has also been removed. See [Release Notes](./ReleaseNotes.md).

#### Dialog Structural Options

Some customizations aren't expressible in CSS (they change which DOM elements render, not just their style). Configure these via `boomiConfig.dialogs`:

```js
export default {
  dialogs: {
    buttonOrder: 'confirm-first',   // 'cancel-first' (default) | 'confirm-first'
    showIcon: false,                 // default true
    destructiveVariant: true,        // default false
  },
};
```

| Option | Description | Default |
|--------|-------------|---------|
| `buttonOrder` | Confirm/cancel button order. Default (`'cancel-first'`) is today's behavior: confirm button leftmost, cancel rightmost. `'confirm-first'` swaps to cancel leftmost, confirm rightmost — matches a common Material Design dialog layout (dismiss on the left, the emphasized/destructive action on the right). | `'cancel-first'` |
| `showIcon` | Whether the type icon (success/warning/error) is shown. | `true` |
| `destructiveVariant` | For `warning`-type dialogs only, renders the confirm button with the `--boomi-btn-danger-*` token family instead of `--boomi-btn-primary-*`, for a destructive-action look (e.g. delete confirmations). | `false` |

These options are structural, not visual-only — they don't change any dialog's functional behavior (button actions, callback payloads, dismiss/confirm logic), and a partner who sets nothing sees no change.

---

### Toast Notifications

Transient toast messages (`ToastNotification`) are fully themeable. Each toast `type` has its own background, foreground, and icon color, and the shared layout / behavior tokens control position, timing, sizing, and typography. Override these like any other token — globally in `cssVars`, per-theme in `cssVarsByTheme`, or per-component-key in `cssVarsByKey`.

#### Per-type colors

| Token | Description |
|-------|-------------|
| `--boomi-toast-success-bg` | Success toast background |
| `--boomi-toast-success-fg` | Success toast text |
| `--boomi-toast-success-icon` | Success toast icon color |
| `--boomi-toast-error-bg` | Error toast background |
| `--boomi-toast-error-fg` | Error toast text |
| `--boomi-toast-error-icon` | Error toast icon color |
| `--boomi-toast-warning-bg` | Warning toast background |
| `--boomi-toast-warning-fg` | Warning toast text |
| `--boomi-toast-warning-icon` | Warning toast icon color |
| `--boomi-toast-info-bg` | Info toast background |
| `--boomi-toast-info-fg` | Info toast text |
| `--boomi-toast-info-icon` | Info toast icon color |
| `--boomi-toast-question-bg` | Question toast background |
| `--boomi-toast-question-fg` | Question toast text |
| `--boomi-toast-question-icon` | Question toast icon color |

#### Layout, typography & behavior

| Token | Description | Default |
|-------|-------------|---------|
| `--boomi-toast-position` | Toast position: `top`, `top-start`, `top-end`, `center`, `bottom`, `bottom-start`, `bottom-end` | `top` |
| `--boomi-toast-timer` | Auto-dismiss time in ms (`0` = stay until dismissed) | `2000` |
| `--boomi-toast-width` | Toast width | `600px` |
| `--boomi-toast-radius` | Corner radius | `0.5rem` |
| `--boomi-toast-shadow` | Box shadow | `0 6px 16px rgba(0,0,0,0.18)` |
| `--boomi-toast-border` | Border | `none` |
| `--boomi-toast-title-fg` | Title color (defaults to the per-type `fg`) | `inherit` |
| `--boomi-toast-progress-bar` | Timer progress-bar color | `rgba(255,255,255,0.7)` |
| `--boomi-toast-progress-display` | Set to `none` to hide the timer progress bar entirely | `block` |
| `--boomi-toast-font` | Toast text font family (falls back to `--boomi-dialog-font`, then `--boomi-font`) | `--boomi-font` |
| `--boomi-toast-font-size` | Toast text font size | `1em` |
| `--boomi-toast-font-weight` | Toast text font weight | `600` |
| `--boomi-toast-line-height` | Toast text line height | `normal` |
| `--boomi-toast-padding` | Toast inner padding | `1em` |
| `--boomi-toast-min-height` | Toast minimum height | `auto` |
| `--boomi-toast-icon-size` | Icon width/height (kept square and tied to a single token so overriding it can't clip the icon under the toast's `overflow: hidden` the way independently resizing width/height/padding could) | `2em` |

#### Example

```js
cssVars: {
  // Brand the error toast and move all toasts to the bottom-right, dismiss after 4s
  '--boomi-toast-error-bg':   '#b91c1c',
  '--boomi-toast-error-fg':   '#ffffff',
  '--boomi-toast-error-icon': '#fecaca',
  '--boomi-toast-position':   'bottom-end',
  '--boomi-toast-timer':      '4000',
  '--boomi-toast-radius':     '0.75rem',
  '--boomi-toast-width':      '420px',
},
```

> Toasts render outside the plugin's Shadow DOM (on `document.body`); EmbedKit resolves the active `--boomi-toast-*` values from the host and applies them automatically, so theme switches and per-key overrides are respected.

> To show toasts with your own notification component instead, register a `toast` [dialog handler](#toast-handler).

---

## 10. Events & Callbacks

EmbedKit emits standardized, typed events for actions that happen inside the
embed — response feedback, integration-pack lifecycle, connection and map
edits, schedule changes, AI transformation generation, agent
sessions/messages, and the session ending or timing out. **EmbedKit never sends event data over the network** — your
application subscribes and owns what happens next. This removes any security
concern about where the data goes: there is no endpoint to protect, no key to
ship to the browser.

This is the mechanism to build a JS-side audit log of what happened in the
embed — including from a vanilla-JS host with no React (e.g. an Angular
wrapper calling `BoomiPlugin` / `RenderComponent` / `DestroyPlugin` directly).

> **UI-triggered only.** These events fire from user-driven actions in the
> embed's own UI. EmbedKit has no visibility into automatic or cloud-scheduled
> activity (a process run by a Boomi schedule, for instance) — an audit trail
> built on these events reflects what happened *through the embed*, not a
> complete record of all platform activity.
>
> **Build coverage differs by event.** The integration-management events
> (`integration.*`, `connection.*`, `map.*`, `schedules.*`, `ai.*`) are only
> reachable from the **Integration method** (npm `@boomi/embedkit`) — the CDN
> build only ever mounts `Agent` / `AgentTiles` / `AgentListLauncher`, so it
> never fires them. The `agent.*` and `feedback` events fire in **both**
> the Integration method and the CDN embed.

> **Built-in components.** Events are emitted by EmbedKit's built-in components. Screens you build directly on the [data hooks](./GettingStarted.md#data-hooks-custom-ui) don't emit them, so add any notifications or logging your own screens need.

### The Event Envelope

Every event follows the same shape:

```ts
type EmbedKitEvent<T> = {
  type: string;             // event type discriminator — see the table below
  timestamp: string;        // ISO-8601, when the event was emitted
  outcome: 'success' | 'error'; // 'error' for auth.session.ended; every other event is 'success' — see note below
  source: {                 // where in the embed it originated
    agentId?: string;
    sessionId?: string;
    messageId?: string;
    integrationPackInstanceId?: string;
    integrationPackId?: string;
    environmentId?: string;
    componentKey?: string;
  };
  data: T;                  // event-type-specific payload — see the table below
};
```

> `outcome` is `'error'` for `auth.session.ended`. Every other event reports a
> completed, successful action, and a future pass may also emit on failed
> actions. Build your subscriber to check `outcome` rather than assuming
> `'success'` forever.

### All Event Types

| `type` | Fires when | `data` payload |
|---|---|---|
| `feedback` | A user rates an agent response or submits a comment | `{ rating, comment?, prompt, response }` |
| `integration.instance.created` | A user installs an integration pack | `{ integrationPackInstanceId, integrationPackId?, integrationPackName?, environmentId?, installationType?, isAgent? }` |
| `integration.instance.deleted` | A user deletes an integration-pack instance | same shape as `.created` |
| `integration.processes.run` | A user runs all processes for an instance ("Run Now") | `{ integrationPackInstanceId, environmentId?, recordUrls: string[] }` |
| `connection.extensions.updated` | A user saves connection/environment-extension changes | `{ integrationPackInstanceId, environmentId?, installationType?, updatedFieldKeys: string[] }` |
| `connection.oauth.initiated` | A user starts an OAuth2 connector authorization flow | `{ integrationPackInstanceId, environmentId?, connectionId, fieldId }` |
| `map.extensions.updated` | A user changes a field mapping or a transformation function | `{ integrationPackInstanceId, environmentId?, mapId, action: 'mapping' \| 'function-change' \| 'function-delete' \| 'function-edit', functionId?, functionName?, updatedCount? }` |
| `map.defaults.seeded` | An integration pack instance was installed and the publisher's default mappings were copied into its map extensions (server on `@boomi/embedkit-sdk` ≥ 1.4.0) | `{ integrationPackInstanceId, environmentId?, summariesFound, seeded: { mapExtensionId, name?, mappings, functions }[], skipped: { mapExtensionId, name?, reason }[], failed: { mapExtensionId?, name?, error }[] }` |
| `map.function.converted` | A user chose **Edit** on a platform-defined function with `updateMaps.convertFunctionsToScript` on, and it was compiled to a script | `{ mapId, functionId, type, warnings: string[] }` |
| `map.browse.executed` | A user resolves dynamic-browse candidates (re-authenticating a connector mid-mapping) | `{ integrationPackInstanceId, mapId, succeededCount, failedCount }` |
| `schedules.updated` | A user saves process schedule changes | `{ integrationPackInstanceId, environmentId?, scheduleCount }` |
| `ai.transformation.generated` | A user generates a transformation script via AI | `{ integrationPackInstanceId?, functionId, prompt }` |
| `agent.session.created` | A chat session is created — check `data.trigger` | `{ trigger: 'user' \| 'system', integrationPackId? }` |
| `agent.session.deleted` | A user deletes a chat session | `{ trigger: 'user', integrationPackId? }` |
| `agent.message.sent` | A user sends a chat message | `{ text, hasAttachments, integrationPackId? }` |
| `agent.message.received` | An agent response is received over the chat stream | `{ messageType, role }` |
| `auth.session.ended` | A part of the UI shows that the session has ended or timed out. `outcome` is `'error'`. Fires once per part per session episode, and again after a new session starts | `{ origin: 'auth' \| 'maps' \| 'agent-chat', code, message }` |

> **`auth.session.ended` tells you where it happened.** `data.origin` is `auth`
> for any screen that uses the standard error dialog or notice (Integrations,
> Connections, Schedules and so on), `maps` for the Map Fields screens, and
> `agent-chat` for the agent chat. `data.code` is the reason: `MISSING_BEARER`
> (there is no session), `TOKEN_REJECTED` (the server answered 401 because the
> token is invalid or expired) or `TOKEN_EXPIRED` (the chat found the token
> expired before it connected). `data.message` is the text EmbedKit shows. If you
> already listen with `'*'`, you now also receive this event. It is a broadcast:
> to replace the dialog itself, use the
> [`sessionError` dialog handler](#sessionerror).

> **`agent.session.created`'s `trigger` field matters.** EmbedKit
> auto-provisions a session on first open so a chat is always ready — that is
> `trigger: 'system'`, not a user action. Only `trigger: 'user'` represents
> someone clicking "new chat". Treating every `agent.session.created` event as
> a user action will over-count in an audit log.

> **Credential-safe by design.** `connection.extensions.updated` reports which
> field *keys* changed (e.g. `"myConnection:username"`), never the values —
> environment/connection extensions commonly carry connector credentials
> (API keys, passwords, OAuth tokens), and those never leave the SDK layer
> into an event payload. Likewise `map.extensions.updated` reports counts and
> names, not the full mapping/function data.

### Subscribing

Three equivalent ways; all receive the same envelope. Use whichever fits your
integration style:

**1. `onEvent` at init** — simplest; receives every event type:

```js
BoomiPlugin({
  serverBase: '/api/v1',
  tenantId: 'my-account',
  boomiConfig,
  onEvent: (event) => {
    switch (event.type) {
      case 'feedback':
        myApi.recordFeedback(event);
        break;
      case 'integration.instance.deleted':
      case 'integration.processes.run':
      case 'connection.extensions.updated':
        // send to your own audit trail, analytics, a Boomi process — your call
        myApi.recordAuditEvent(event);
        break;
      default:
        break;
    }
  },
});
```

The CDN embed accepts the same callback: `window.BoomiEmbed = { publicToken, agentId, onEvent: (event) => { ... } }`.

**2. `BoomiEvents` subscription API** — programmatic, per-type, unsubscribable:

```js
import { BoomiEvents } from '@boomi/embedkit';

const off = BoomiEvents.on('feedback', (event) => { /* ... */ });
// BoomiEvents.on('*', handler) receives every event type
off(); // unsubscribe
```

**3. `boomi:event` DOM CustomEvent** — zero-import option for plain-JS/CDN pages:

```js
window.addEventListener('boomi:event', (e) => {
  const event = e.detail; // the EmbedKitEvent envelope
});
```

> DOM listeners cannot be auto-detected, so UI that only renders when a
> subscriber exists (like the feedback bar) must be explicitly enabled in
> config when this is your only subscription method (e.g.
> `feedback: { enabled: true }`).

Subscriber errors are isolated — a handler that throws never breaks the embed
UI or other subscribers.

### Feedback Events

`type: 'feedback'` — emitted when a user rates an agent response or submits a
comment. See [Response Feedback](#response-feedback-feedback) for the UI
configuration.

```json
{
  "type": "feedback",
  "timestamp": "2026-07-13T17:20:04.512Z",
  "outcome": "success",
  "source": {
    "agentId": "my-agent-id",
    "sessionId": "9c1a6c2e-…",
    "messageId": "a2b4d6f8-…"
  },
  "data": {
    "rating": "up",
    "comment": "Exactly what I needed.",
    "prompt": "What is the current status of my running processes?",
    "response": "All 12 processes completed successfully in the last hour…"
  }
}
```

| Field | Description |
|-------|-------------|
| `data.rating` | `"up"`, `"down"`, or `null` (the user cleared their rating). |
| `data.comment` | Present only when the user submitted a comment. |
| `data.prompt` | Text of the user message that produced this response (nearest preceding user message). |
| `data.response` | The agent response being rated — plain text, rendered HTML, or serialized data, matching what the user saw. |

---

## 11. Dialog Handlers

Before it deletes an integration, runs every process of an integration, disconnects mappings, deletes a transformation or deletes an agent chat, EmbedKit asks "Are you sure?" with its own SweetAlert dialog. If your app already has a dialog component (for example Angular Material's `MatDialog`), register a **dialog handler** and EmbedKit calls your function instead. EmbedKit waits for the answer and continues only when your function returns `true`. The same system lets you replace the message EmbedKit shows when the session has ended or timed out (see [`sessionError`](#sessionerror)).

Handlers are opt-in. With no handler registered, nothing changes.

> **Handlers are not events.** [Events](#10-events--callbacks) are a broadcast: any number of listeners, return values ignored, nothing waits. A dialog handler is a single owner that EmbedKit waits for, and its answer decides what EmbedKit does next. You cannot use `onEvent` to approve or block an action.

### Quick start

```js
import BoomiPlugin from '@boomi/embedkit';

BoomiPlugin({
  serverBase: 'https://your-embedkit-server.com/api/v1',
  tenantId: 'YOUR_BOOMI_PARENT_ACCOUNT_ID',
  nonce: nonceFromServer,
  boomiConfig: uiConfig,
  dialogHandlers: {
    // Return strictly `true` to proceed. Anything else cancels.
    confirm: async (req) => {
      const answer = await myDialog.open({
        title: req.title,
        message: req.description,
        okLabel: req.confirmLabel,
        cancelLabel: req.cancelLabel,
        danger: req.destructive,
      });
      return answer === true;
    },
  },
});
```

`return answer === true` is all a `confirm` handler needs: it turns `false`, `undefined` (a dialog dismissed with the backdrop or Escape) and anything else into "cancel".

### Registering handlers

| Where | How |
|-------|-----|
| npm (Integration method) | `BoomiPlugin({ ..., dialogHandlers })` |
| CDN embed | `window.BoomiEmbed = { ..., dialogHandlers }`, or `BoomiPublicEmbed({ ..., dialogHandlers })` |
| Any time, no reload | `DialogHandlerRegistry.set(handlers)` and `DialogHandlerRegistry.clear()` |

`DialogHandlerRegistry` is exported from `@boomi/embedkit`. In the CDN build it is on the UMD global: `window.BoomiEmbedKitCdn.DialogHandlerRegistry`.

| Method | Description |
|--------|-------------|
| `set(handlers)` | Registers handlers, replacing any previous set. `set(null)` or `set(undefined)` is the same as `clear()`. Replacing handlers does not cancel a dialog that is already open. |
| `get()` | The registered handlers, or `null` when the built-in dialogs are in use. |
| `clear()` | Removes all handlers and returns to the built-in dialogs. A request still waiting on a handler is cancelled and its `signal` is aborted. |

Things to know:

- EmbedKit reads the registry each time a dialog is needed, so registering, replacing or clearing at runtime takes effect on the next dialog. No page reload.
- `BoomiPlugin` and the CDN embed register handlers only when their config contains `dialogHandlers`. A config without it leaves the registry as it is, so several embeds on one page do not clear each other's handlers. Call `DialogHandlerRegistry.clear()` to remove them.
- The CDN script can start before your framework has built its handler. Start the embed without `dialogHandlers` and call `window.BoomiEmbedKitCdn.DialogHandlerRegistry.set(...)` once your handler exists.
- `EmbedKitProvider` accepts the same `config` type, so TypeScript allows `dialogHandlers` there, but the provider does not read it and the handlers would be silently ignored. If you mount EmbedKit with `EmbedKitProvider`, register them with `DialogHandlerRegistry.set()` instead.
- There is exactly one set of handlers per page. Each of `confirm`, `alert`, `sessionError` and `toast` is optional and independent: registering only `toast` leaves confirm dialogs on the built-in SweetAlert.

### `confirm`

```ts
confirm?: (req: ConfirmRequest) => Promise<boolean> | boolean;
```

EmbedKit proceeds only when the return value (or the resolved value of the returned promise) is strictly `true`.

| `ConfirmRequest` field | Type | Description |
|------------------------|------|-------------|
| `id` | `string` | Unique per request. Also appears in EmbedKit's log lines about this request. |
| `intent` | `'error' \| 'warning' \| 'success' \| 'info' \| 'question'` | The kind of dialog. Today's confirms are all `'warning'`. |
| `title` | `string` | Dialog title. |
| `description` | `string` | Dialog message. |
| `confirmLabel` | `string` | Label for the confirming button. |
| `cancelLabel` | `string` | Label for the cancelling button. |
| `destructive` | `boolean` | `true` when the action removes or disconnects something. Use it to style your confirm button (for example Material's `warn` color). |
| `dismissible` | `{ outsideClick: boolean; escapeKey: boolean }` | Whether the dialog may be closed by clicking outside it or pressing Escape. |
| `timerMs` | `number` (optional) | Present only when the dialog should close itself after this many milliseconds. |
| `signal` | `AbortSignal` | Aborted when EmbedKit stops waiting. See [Timeout and abort](#timeout-and-abort). |
| `source` | `{ hostId: string; componentKey: string; tenantId?: string; componentName?: string }` | Which embed and component raised the dialog. |

Every field except `timerMs` is always filled in, and `timerMs` is present only when a timer applies. EmbedKit never passes your handler an `undefined` for something it needs you to display.

**Which actions call `confirm`:**

| Action | `description` | `confirmLabel` | `destructive` |
|--------|---------------|----------------|---------------|
| Delete an integration | `This action cannot be undone.` | `Yes, delete it!` | `true` |
| Run all processes of an integration | `This action will start all processes associated with this integration.` | `Yes, run now!` | `false` |
| Disconnect all mappings from a source field | `Disconnecting these mappings cannot be undone.` | `Yes, Disconnect All!` | `true` |
| Delete a transformation | `Deleting this transformation cannot be undone and will remove all mappings associated with it.` | `Yes, Delete!` | `true` |
| Delete an agent chat (also in the CDN embed) | `This action cannot be undone.` | `Yes, delete it!` | `true` |

All of them use the title `Are you sure?`, the cancel label `No, cancel`, the intent `'warning'`, and are dismissible by outside click and Escape. EmbedKit sets `destructive` for each action itself. It does not depend on `dialogs.destructiveVariant`, which only styles the built-in dialog.

### `alert`

```ts
alert?: (req: AlertRequest) => Promise<void> | void;
```

Resolve (or return) when the user has acknowledged the message. `AlertRequest` has the same fields as `ConfirmRequest` except `cancelLabel` and `destructive`. If your handler throws, rejects or times out, EmbedKit treats the alert as acknowledged and carries on.

EmbedKit's built-in screens do not raise an alert dialog today, so an `alert` handler is not called yet. It is part of the contract so you can register all three handlers once.

### `toast` handler

```ts
toast?: (req: ToastRequest) => void;
```

Toasts are short, non-blocking messages such as "Integration deleted successfully!". With a `toast` handler registered, EmbedKit does not show its own toast: it calls your function once per toast and moves on. Nothing waits for it, and a handler that throws or rejects is logged and ignored.

| `ToastRequest` field | Type | Description |
|----------------------|------|-------------|
| `id` | `string` | Unique per request. |
| `intent` | `'error' \| 'warning' \| 'success' \| 'info' \| 'question'` | The kind of toast. |
| `message` | `string` | The text to show. |
| `timerMs` | `number` | How long the built-in toast would stay open, in milliseconds (the `--boomi-toast-timer` value). When the variable is not set, this is `2000`. `0` is reported when the variable is set to `0` or to something that is not a positive number, and means the built-in toast would stay until dismissed. |
| `source` | `{ hostId: string; componentKey: string; tenantId?: string }` | Which embed raised the toast. |

### `sessionError`

```ts
sessionError?: (req: SessionErrorRequest) => Promise<void> | void;
```

When the session has ended or timed out, EmbedKit shows a message. Register `sessionError` to show your own UI instead. Resolve (or return) when the user has acknowledged it. If your handler throws, rejects or times out, EmbedKit treats it as acknowledged.

With a `sessionError` handler registered, EmbedKit does **not** show its built-in session message anywhere (the standard error dialog and notice, the Map Fields screens and the agent chat error block all stay hidden for this error). You receive the request once per session episode: it is sent again only after a new session has started. The [`auth.session.ended`](#all-event-types) event is emitted too, so you can log it or react to it.

`SessionErrorRequest` has the same fields as `AlertRequest` (`id`, `intent`, `title`, `description`, `confirmLabel`, `dismissible`, `signal`, `source`) plus:

| Field | Type | Description |
|-------|------|-------------|
| `origin` | `'auth' \| 'maps' \| 'agent-chat'` | Which part of the UI reported the problem. `auth` is any screen that uses the standard error dialog or notice, `maps` is Map Fields, `agent-chat` is the agent chat. |
| `code` | `string` | Why: `MISSING_BEARER` (no session), `TOKEN_REJECTED` (the server answered 401, so the token is invalid or expired) or `TOKEN_EXPIRED` (the chat found the token expired). |

`description` is the ready-made text: your [`messages.sessionEnded`](#session-ended-message) value, or the default. Show it as it is, or show your own wording. `title` is `Connection timed out`.

```js
dialogHandlers: {
  sessionError: async (req) => {
    await myDialog.open({
      title: req.title,
      message: req.description, // or your own wording
      okLabel: req.confirmLabel,
    });
    // Often the right move here: ask your own app for a fresh session
    // (a new nonce), then call BoomiPlugin(...) again.
  },
},
```

> **Use the handler or the text, depending on what you need.** To change only the wording, set `boomiConfig.messages.sessionEnded` (below). To control the whole dialog, or react in your app, register `sessionError`. If both are set, the handler runs and EmbedKit's own message stays hidden, so the text matters only as `req.description`.

### Session-Ended Message

The default text is:

> Your connection to this section has timed out. Reload the page to continue.

To use your own wording in EmbedKit's built-in message, set `messages.sessionEnded` in `boomi.config.js`:

```js
export default {
  messages: {
    sessionEnded: 'This panel lost its connection. Refresh the page to continue.',
  },
  // ...
};
```

An empty or non-string value restores the default. The text applies to the standard error dialog and notice and to the Map Fields screens. The agent chat keeps its own message, because it comes from a check in the browser of the token's expiry, but the chat also raises `auth.session.ended` and calls your `sessionError` handler.

What your code receives on a session error has not changed: the error carries `code: 'MISSING_BEARER'` when there is no session, and the server's `401` is reported with `status: 401` and, now, `code: 'TOKEN_REJECTED'`. Match on `error.code`, not on the message text, because the text is meant to be customized.

### Timeout and abort

`timeoutMs` (default `120000`, that is 120 seconds) is the longest EmbedKit waits for a `confirm`, `alert` or `sessionError` handler. Set it next to the handlers:

```js
dialogHandlers: { timeoutMs: 60000, confirm: myConfirm }
```

A value that is not a positive number falls back to the default, and a value above `2147483647` (about 24.8 days, the longest delay a browser timer accepts) is capped at that limit. When the time runs out, EmbedKit cancels the action, logs that the request was abandoned, ignores any answer that arrives later, and **aborts `req.signal`**. Listen for that signal to close your own dialog so it does not stay on screen after EmbedKit has moved on:

```js
confirm: (req) =>
  new Promise((resolve) => {
    const dialog = myDialog.open({ title: req.title, message: req.description });
    dialog.onClose((answer) => resolve(answer === true));
    req.signal.addEventListener('abort', () => dialog.close(), { once: true });
  }),
```

The signal is also aborted when `DialogHandlerRegistry.clear()` is called while a request is waiting.

### Failure rules

A handler can never leave EmbedKit stuck or acting on a bad answer.

| Situation | Outcome |
|-----------|---------|
| No `confirm` handler registered | The built-in SweetAlert dialog is shown, unchanged. The only case where SweetAlert renders. |
| Handler returns or resolves strictly `true` | Proceed. |
| Handler returns or resolves `false`, `undefined` (for example Material's `afterClosed()` after a backdrop click or Escape), `null`, or any other value that is not `true` | Cancel. |
| Handler throws, or its promise rejects | Cancel. The error is logged with the request `id`. |
| Handler never answers | Cancel after `timeoutMs`. Logged as abandoned, and `req.signal` is aborted. A late answer is ignored, so nothing is deleted after the fact. |
| Any of the failures above | **The built-in dialog is never shown as a fallback once a handler is registered.** |
| `alert` or `sessionError` handler fails or times out | Logged and treated as acknowledged. |
| `toast` handler fails | Logged and ignored. |

### Examples

**Plain JavaScript with `window.confirm`** (enough to prove the wiring):

```js
BoomiPlugin({
  // ...serverBase, tenantId, nonce, boomiConfig
  dialogHandlers: {
    confirm: (req) => window.confirm(`${req.title}\n${req.description}`),
  },
});
```

**CDN embed, registered after your framework is ready:**

```html
<script>
  window.BoomiEmbed = { publicToken: 'pk_...', agentId: 'project_...', mountId: 'boomi-agent', serverBase: 'https://api.boomi.space/api/v1' };
</script>
<script src="https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/embedkit-cdn.umd.js" async></script>
<script>
  // Later, once your own dialog service exists:
  window.BoomiEmbedKitCdn.DialogHandlerRegistry.set({
    confirm: (req) => myDialogService.confirm(req.title, req.description).then((ok) => ok === true),
  });
  // And to go back to the built-in dialogs, with no reload:
  // window.BoomiEmbedKitCdn.DialogHandlerRegistry.clear();
</script>
```

**Angular Material `MatDialog`:**

```ts
import { Component, NgZone } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import BoomiPlugin from '@boomi/embedkit';
import type { ConfirmRequest } from '@boomi/embedkit';
import { ConfirmDialogComponent } from './confirm-dialog.component';

@Component({ selector: 'app-embed', template: '<div id="boomi-host"></div>' })
export class EmbedComponent {
  constructor(private dialog: MatDialog, private zone: NgZone) {}

  start(nonce: string) {
    BoomiPlugin({
      serverBase: '/api/v1',
      tenantId: 'YOUR_BOOMI_PARENT_ACCOUNT_ID',
      nonce,
      dialogHandlers: {
        confirm: (req: ConfirmRequest) =>
          this.zone.run(async () => {
            const ref = this.dialog.open(ConfirmDialogComponent, {
              data: req, // title, description, labels, destructive
              disableClose: !req.dismissible.outsideClick || !req.dismissible.escapeKey,
            });
            req.signal.addEventListener('abort', () => ref.close(), { once: true });
            const result = await firstValueFrom(ref.afterClosed());
            return result === true; // afterClosed() emits undefined on backdrop or Escape
          }),
      },
    });
  }
}
```

Two Angular details: EmbedKit may call your function from outside Angular's zone, so `NgZone.run` makes the dialog open with change detection working; and `afterClosed()` emits `undefined` when the user dismisses with the backdrop or Escape, which `result === true` correctly treats as cancel.

### Types

The types `DialogHandlers`, `ConfirmRequest`, `AlertRequest`, `ToastRequest`, `DialogIntent` and `DialogSource` are exported from `@boomi/embedkit` for TypeScript. The `DialogHandlerRegistry` object is exported from `@boomi/embedkit` too, and in the CDN build it is on the `BoomiEmbedKitCdn` global. The CDN build has no types, so only the registry is available there.

---

*For the full setup walkthrough, see [Getting Started](./GettingStarted.md). For the CDN-specific setup, see [CDN Configuration](./CDNConfiguration.md). For authoring Map Extension transformations (including AI-assisted generation), see the [Transformation Editor](./TransformationEditor.md) guide.*
