# Boomi EmbedKit — Configuration Reference

This document is the complete reference for all user-facing configuration options in Boomi EmbedKit. It covers initialization, agent configuration, component configuration, theming, form customization, and every CSS design token available for styling.

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

---

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
| `ui` | `AgentUiConfig` | All chat UI configuration. See [AgentUiConfig](#agentUiconfig) below. |
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

## 5. Component Configuration

Passed as `boomiConfig.components[componentKey]`. Each key is the `componentKey` you pass to `RenderComponent`.

```js
components: {
  myIntegrations: {
    renderType:      'integration',
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
| `showTitle` | `boolean` | Show or hide the component title. |
| `title` | `string` | Override text for the component title. |
| `showDescription` | `boolean` | Show or hide the component description. |
| `description` | `string` | Override text for the component description. |
| `mapping.useTreeMode` | `boolean` | When `true`, the mapping canvas uses tree view instead of the default layout. |

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

---

### Notices / Alerts

| Token | Description |
|-------|-------------|
| `--boomi-notice-bg` | Default notice background |
| `--boomi-notice-fg` | Default notice text |
| `--boomi-notice-border` | Default notice border |
| `--boomi-notice-radius` | Notice border radius |
| `--boomi-notice-shadow` | Notice shadow |
| `--boomi-notice-icon-opacity` | Notice icon opacity |
| `--boomi-notice-success-bg` | Success notice background |
| `--boomi-notice-success-fg` | Success notice text |
| `--boomi-notice-success-border` | Success notice border |
| `--boomi-notice-success-shadow` | Success notice shadow |
| `--boomi-notice-warning-bg` | Warning notice background |
| `--boomi-notice-warning-fg` | Warning notice text |
| `--boomi-notice-warning-border` | Warning notice border |
| `--boomi-notice-warning-shadow` | Warning notice shadow |
| `--boomi-notice-error-bg` | Error notice background |
| `--boomi-notice-error-fg` | Error notice text |
| `--boomi-notice-error-border` | Error notice border |
| `--boomi-notice-error-shadow` | Error notice shadow |

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

| Token | Description |
|-------|-------------|
| `--boomi-swal-bg` | Dialog background |
| `--boomi-swal-fg` | Dialog text |
| `--boomi-swal-border` | Dialog border |
| `--boomi-swal-shadow` | Dialog shadow |
| `--boomi-swal-title-fg` | Dialog title color |
| `--boomi-swal-desc-fg` | Dialog description color |
| `--boomi-swal-overlay-bg` | Overlay/backdrop color |
| `--boomi-swal-icon-success` | Success icon color |
| `--boomi-swal-icon-warning` | Warning icon color |
| `--boomi-swal-icon-error` | Error icon color |

---

*For the full setup walkthrough, see [Getting Started](./GettingStarted.md). For the CDN-specific setup, see [CDN Configuration](./CDNConfiguration.md).*
