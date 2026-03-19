# Boomi EmbedKit — CDN Configuration Guide

This guide covers everything you need to embed Boomi AI Agents into any existing website using the EmbedKit CDN drop-in script. No build tools or npm packages required.

---

## Table of Contents

1. [What Is the EmbedKit CDN?](#1-what-is-the-embedkit-cdn)
2. [Logging In to the Admin Console](#2-logging-in-to-the-admin-console)
3. [Boomi Credentials You Will Need](#3-boomi-credentials-you-will-need)
4. [Configuring CORS](#4-configuring-cors)
5. [Creating a Project](#5-creating-a-project)
   - [Embed Types](#embed-types)
   - [Agent UI Options](#agent-ui-options)
   - [Launcher Options](#launcher-options)
   - [Theme & CSS Variables](#theme--css-variables)
   - [Full Configuration Reference](#full-configuration-reference)
6. [Adding the CDN Script to Your Website](#6-adding-the-cdn-script-to-your-website)
7. [Advanced Options](#7-advanced-options)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. What Is the EmbedKit CDN?

The EmbedKit CDN is a pre-built JavaScript bundle that lets you drop Boomi AI Agents into **any existing website** with a few lines of HTML — no React, no npm, no build pipeline needed.

**How it works:**

```
Your Website                  EmbedKit CDN Server            EmbedKit API Server
    │                               │                               │
    │  1. Load CSS + UMD script     │                               │
    │ ────────────────────────────► │                               │
    │                               │                               │
    │  2. Script reads window.BoomiEmbed config                     │
    │                               │                               │
    │  3. POST /embed/session (publicToken + agentId + origin)      │
    │ ──────────────────────────────────────────────────────────►   │
    │                               │  4. Validate token, agent,    │
    │                               │     origin allowlist          │
    │  5. Return accessToken + config                               │
    │ ◄──────────────────────────────────────────────────────────   │
    │                               │                               │
    │  6. Render Agent UI in <div id="boomi-agent">                 │
```

The CDN bundle is entirely self-contained — React and ReactDOM are bundled in. Nothing additional is required on the host page.

**Assets:**

| File | Purpose |
|------|---------|
| `https://cdn.boomi.space/embedkit-cdn.umd.cjs` | JavaScript bundle (UMD — works in all browsers) |
| `https://cdn.boomi.space/cdn/embedkit-cdn.css` | Required stylesheet |

---

## 2. Logging In to the Admin Console

All configuration — CORS origins, agents, projects, and public tokens — is managed through the EmbedKit Admin Console.

**URL:** [https://admin.boomi.space](https://admin.boomi.space)

### Login Steps

1. Navigate to [https://admin.boomi.space](https://admin.boomi.space)
2. Enter your **Boomi Parent Account ID** (your `tenantId`) and your admin credentials
3. Once authenticated you will land on the **Admin Dashboard**

The admin console contains the following sections relevant to CDN setup:

| Section | Purpose |
|---------|---------|
| **CORS** | Add the domains that are allowed to embed your agents |
| **Agents** | Register Boomi agent IDs from your Boomi account |
| **Projects** | Create public embed configurations (what the CDN script uses) |
| **Tokens** | View the public token generated for each project |

---

## 3. Boomi Credentials You Will Need

> **See also:** [GettingStarted.md](./GettingStarted.md) for the full credential setup walkthrough.

Before you can use the CDN, you need the following from your Boomi account:

### From Boomi Platform

| Credential | Where to Find It | Required For |
|-----------|-----------------|-------------|
| **Parent Account ID** | Boomi Platform → Account Settings | Your `tenantId` — used everywhere |
| **Boomi Agent ID** | Boomi Platform → AI Agents | The agent you want to expose via the CDN |
| **API Username** | Boomi Platform → Settings → API Management | Server-to-server auth (admin console login) |
| **API Token** | Boomi Platform → Settings → API Management | Server-to-server auth (admin console login) |

### What You Do NOT Need for CDN Embed

The CDN (public embed) flow does **not** require:
- Your API username or token on the frontend
- A server-side session endpoint
- OAuth2 credentials (unless your agent requires them)
- User accounts in Boomi

The public embed is designed for **anonymous or lightly-authenticated** surfaces — your website, a marketing page, a customer portal — where visitors interact with an agent without needing a full Boomi account.

### Prerequisite Checklist

- [ ] You have a Boomi Parent Account with at least one active AI Agent
- [ ] Your Boomi Agent has been built and deployed (status: `ACTIVE`)
- [ ] You can log in to [admin.boomi.space](https://admin.boomi.space)
- [ ] You know the public URL(s) of the website(s) where you want to embed the agent

---

## 4. Configuring CORS

Before any embed will work, you must register the **origin(s)** of your website. The EmbedKit server enforces strict origin checking — requests from unregistered origins are rejected with HTTP 403.

### What Is an Origin?

An origin is the scheme + hostname + port of your website:

```
https://www.example.com        ✓ correct
https://app.example.com        ✓ correct (subdomains are separate origins)
http://localhost:3000           ✓ correct for local development
https://example.com/some/path  ✗ wrong — paths are not part of the origin
```

### Adding CORS Origins via Admin Console

1. Log in to [admin.boomi.space](https://admin.boomi.space)
2. Navigate to **CORS** in the left sidebar
3. Click **Add Origin**
4. Enter the full origin URL (e.g., `https://www.example.com`)
5. Click **Save**

Repeat for every domain where you plan to embed the agent, including `http://localhost:PORT` for local development.

> **Important:** CORS origins are shared across all projects for your tenant. An origin added here can be assigned to any project.

### What Happens If an Origin Is Missing?

The CDN script will receive a `403 Forbidden` response when it tries to create an embed session. The agent will not render, and the browser console will show a CORS or 403 error.

---

## 5. Creating a Project

A **Project** is the core configuration object for a public embed. It defines:
- Which Boomi agent(s) are exposed
- How the UI is displayed (single agent, tiles, list)
- Which origins are allowed to load it
- The visual configuration (launcher position, modal size, theme, etc.)

A Project generates a **public token** (`pk_...`) that you include in your website's CDN config.

### Creating a Project in Admin Console

1. Log in to [admin.boomi.space](https://admin.boomi.space)
2. Navigate to **Projects** in the left sidebar
3. Click **Add Project**
4. Fill in the form:

| Field | Description |
|-------|-------------|
| **Project Name** | A friendly label for your reference (e.g., "Support Widget — Production") |
| **Embed Type** | How the agent(s) are surfaced. See [Embed Types](#embed-types) below |
| **Agent** | The Boomi agent(s) to expose. Select from the list of active agents in your account |
| **Allowed Origins** | The domain(s) you registered in the CORS step |

5. Use the **Builder** tab to configure the visual options (or switch to **JSON** for full control)
6. Click **Create Project**
7. A **public token** is automatically generated and shown in the token dialog

Copy the public token — you will need it for the CDN script on your website.

---

### Embed Types

Choose how your agent(s) are presented to website visitors:

#### `single` — Single Agent (Default)

A floating launcher button appears on the page. Clicking it opens a single agent in a modal or full-screen panel.

Best for: Simple use cases with one agent per page (e.g., a support chatbot).

```
[Website content]                    [🤖 Chat with us]  ← floating launcher pill
                                             │
                                             ▼ (click)
                                    ┌─────────────────────┐
                                    │   Agent Chat Window  │
                                    │                     │
                                    │  Welcome!           │
                                    │  How can I help?    │
                                    └─────────────────────┘
```

#### `tiles` — Multi-Agent Tiles

Multiple agents displayed as a grid of cards embedded inline in the page. Each card shows the agent's name, description, and a launch button.

Best for: Agent marketplaces or portals where users choose from multiple agents.

```
┌─────────────────────────────────────────────────────────┐
│  Available Agents                  🔍 Search...         │
├───────────────┬───────────────┬───────────────┬─────────┤
│  📊 Data Bot  │  💬 Support   │  🔧 IT Help   │   ...   │
│  Analyze data │  Chat support │  Tech support │         │
│  [Launch]     │  [Launch]     │  [Launch]     │         │
└───────────────┴───────────────┴───────────────┴─────────┘
```

#### `list` — Multi-Agent List (Pill + Modal)

A floating pill launcher opens a searchable list of agents in a modal. The user picks one, which then opens the agent UI.

Best for: Large agent catalogs where users need to search and select.

```
[Website content]           [🤖 Find an Agent]  ← floating pill
                                    │
                                    ▼ (click)
                           ┌──────────────────────┐
                           │  🔍 Search agents...  │
                           ├──────────────────────┤
                           │  📊 Data Analysis Bot │
                           │  💬 Customer Support  │
                           │  🔧 IT Helpdesk       │
                           └──────────────────────┘
```

---

### Agent UI Options

These options control the chat window that opens when an agent is launched.

#### Display Mode

| Option | Value | Description |
|--------|-------|-------------|
| `ui.mode` | `'modal'` | Agent opens in a floating dialog over the page |
| `ui.mode` | `'full'` | Agent fills its parent container (inline embed) |

#### Welcome Screen

Shown to users before they send their first message.

| Option | Type | Description |
|--------|------|-------------|
| `ui.welcome.title` | `string` | Main heading (e.g., `"Hello! 👋"`) |
| `ui.welcome.subtitle` | `string` | Subheading or call to action (e.g., `"Ask me anything about your account."`) |

#### Prompts

Pre-built prompt suggestions shown on the welcome screen. Clicking one sends the prompt automatically.

```json
"ui": {
  "prompts": [
    { "title": "Get started", "prompt": "What can you help me with?" },
    { "title": "Check status", "prompt": "What is the status of my order?" },
    { "title": "Report an issue", "prompt": "I need to report a problem." }
  ]
}
```

#### Modal Sizing (when `mode: 'modal'`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ui.modal.width` | `number` | `600` | Modal width in pixels |
| `ui.modal.height` | `number` | `700` | Modal height in pixels |
| `ui.modal.position.corner` | `string` | `'bottom-right'` | Corner anchor. One of: `bottom-right`, `bottom-left`, `top-right`, `top-left` |
| `ui.modal.position.offsetX` | `number` | `20` | Horizontal offset from the corner (px) |
| `ui.modal.position.offsetY` | `number` | `100` | Vertical offset from the corner (px) |

#### Sidebar

A collapsible left panel showing chat history.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ui.sidebar.show` | `boolean` | `false` | Show the session history sidebar |
| `ui.sidebar.width` | `number` | `280` | Sidebar width in pixels |

#### Session Scope

| Option | Value | Description |
|--------|-------|-------------|
| `ui.sessionScope` | `'mount'` | Each page load starts a fresh chat session |
| `ui.sessionScope` | `'multi'` | Chat history persists across multiple messages (sidebar enabled) |

#### File Attachments

| Option | Type | Description |
|--------|------|-------------|
| `ui.fileAttachmentSupported` | `boolean` | Allow users to attach files |
| `ui.fileAttachmentRequired` | `boolean` | Require at least one file before sending |
| `ui.allowedFileExtensions` | `string \| string[]` | e.g., `".csv,.xlsx"` or `[".csv", ".xlsx"]` |
| `ui.maxFiles` | `number` | Maximum number of files per message |
| `ui.maxTotalBytes` | `number` | Total file size limit in bytes |

#### Page Header (Inline / Full Mode)

When `ui.mode: 'full'`, a page header can be shown above the chat.

| Option | Type | Description |
|--------|------|-------------|
| `ui.pageShowHeader` | `boolean` | Show a header bar above the chat |
| `ui.pageShowTitle` | `boolean` | Show the agent title in the header |
| `ui.pageTitle` | `string` | Override the title text |
| `ui.pageShowDescription` | `boolean` | Show a description below the title |
| `ui.pageDescription` | `string` | Description text |

---

### Launcher Options

For `single` embed type, a floating launcher button appears on the page. These options control its appearance and position.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `position.corner` | `string` | `'bottom-right'` | Page corner to anchor the launcher. One of: `bottom-right`, `bottom-left`, `top-right`, `top-left` |
| `position.offsetX` | `number` | `20` | Horizontal offset from the edge (px) |
| `position.offsetY` | `number` | `40` | Vertical offset from the edge (px) |
| `shape` | `string` | `'pill'` | `'pill'` (rounded rectangle) or `'circle'` (round button) |
| `label` | `string` | `''` | Text shown on the pill (e.g., `"Chat with us"`) |
| `icon` | `string` | `''` | Emoji or text icon shown on the button (e.g., `"🤖"`) |
| `hideIcon` | `boolean` | `false` | Hide the icon entirely |

For `list` embed type, these options control the floating pill that opens the agent list:

| Option | Type | Description |
|--------|------|-------------|
| `components.agentList.launcher.position` | `UIPosition` | Position of the pill launcher |
| `components.agentList.launcher.shape` | `string` | `'pill'` or `'circle'` |
| `components.agentList.launcher.label` | `string` | Text on the launcher (e.g., `"Find an Agent"`) |
| `components.agentList.launcher.icon` | `string` | Icon emoji/text |
| `components.agentList.launcher.hideIcon` | `boolean` | Hide the icon |
| `components.agentList.modal.width` | `number` | Width of the agent list modal |
| `components.agentList.modal.height` | `number` | Height of the agent list modal |
| `components.agentList.welcome.title` | `string` | Heading shown in the list modal |
| `components.agentList.welcome.subtitle` | `string` | Sub-heading in the list modal |

---

### Theme & CSS Variables

The EmbedKit has three built-in themes and supports fully custom themes via CSS variables.

#### Built-in Themes

| Theme | Description |
|-------|-------------|
| `boomi` | Boomi brand styling — polished, professional. **Recommended starting point.** |
| `light` | Clean light palette, accessible contrast |
| `dark` | High-contrast dark palette for low-light environments |

#### Theme Configuration

```json
"theme": {
  "allowThemes": true,
  "defaultTheme": "boomi"
}
```

| Option | Type | Description |
|--------|------|-------------|
| `theme.allowThemes` | `boolean` | Allow the theme to be toggled at runtime |
| `theme.defaultTheme` | `string` | Starting theme: `'boomi'`, `'light'`, `'dark'`, or your custom theme name |

#### Custom Themes via CSS Variables

Define a custom theme by providing a map of CSS variable overrides under `cssVarsByTheme`. Use any name you choose as the theme key.

```json
"cssVarsByTheme": {
  "my-brand": {
    "--boomi-root-bg-color": "#1a1a2e",
    "--boomi-btn-primary-bg": "#e94560",
    "--boomi-btn-primary-fg": "#ffffff"
  }
}
```

Then reference it as the default theme:

```json
"theme": {
  "defaultTheme": "my-brand"
}
```

#### CSS Variables Reference

All variables cascade — you only need to override the ones you want to change. Start from a built-in theme and override a handful of tokens for brand alignment.

---

**Surfaces & Backgrounds**

| Variable | Description |
|----------|-------------|
| `--boomi-root-bg-color` | Outermost background of the plugin shell |
| `--boomi-root-fg-color` | Outermost foreground (text) color |
| `--boomi-page-bg-color` | Main page/content area background |
| `--boomi-page-fg-color` | Main page/content area text color |
| `--boomi-root-bg-image` | Optional background image (CSS `background-image` value) |

---

**Buttons — Primary**

| Variable | Description |
|----------|-------------|
| `--boomi-btn-primary-bg` | Background color |
| `--boomi-btn-primary-fg` | Text/icon color |
| `--boomi-btn-primary-border` | Border color |
| `--boomi-btn-primary-shadow` | Box shadow |
| `--boomi-btn-primary-bg-hover` | Background on hover |
| `--boomi-btn-primary-fg-hover` | Text color on hover |
| `--boomi-btn-primary-border-hover` | Border on hover |
| `--boomi-btn-primary-shadow-hover` | Shadow on hover |
| `--boomi-btn-primary-bg-active` | Background when pressed |
| `--boomi-btn-primary-bg-disabled` | Background when disabled |
| `--boomi-btn-primary-fg-disabled` | Text when disabled |

---

**Buttons — Secondary**

| Variable | Description |
|----------|-------------|
| `--boomi-btn-secondary-bg` | Background color |
| `--boomi-btn-secondary-fg` | Text/icon color |
| `--boomi-btn-secondary-border` | Border color |
| `--boomi-btn-secondary-shadow` | Box shadow |
| `--boomi-btn-secondary-bg-hover` | Background on hover |
| `--boomi-btn-secondary-fg-hover` | Text color on hover |
| `--boomi-btn-secondary-border-hover` | Border on hover |
| `--boomi-btn-secondary-shadow-hover` | Shadow on hover |
| `--boomi-btn-secondary-bg-active` | Background when pressed |
| `--boomi-btn-secondary-bg-disabled` | Background when disabled |
| `--boomi-btn-secondary-fg-disabled` | Text when disabled |

---

**Inputs & Form Controls**

| Variable | Description |
|----------|-------------|
| `--boomi-input-bg` | Input field background |
| `--boomi-input-fg` | Input text color |
| `--boomi-input-border` | Input border color |
| `--boomi-input-shadow` | Input box shadow |
| `--boomi-input-placeholder` | Placeholder text color |
| `--boomi-input-border-focus` | Border color when focused |
| `--boomi-input-shadow-focus` | Shadow when focused |
| `--boomi-input-outline-focus` | Outline ring when focused |
| `--boomi-input-bg-disabled` | Background when disabled |
| `--boomi-input-border-disabled` | Border when disabled |
| `--boomi-form-label-fg` | Form label text color |
| `--boomi-form-helper-fg` | Helper text color |
| `--boomi-form-required-fg` | Required field indicator color |
| `--boomi-form-error-fg` | Validation error message color |

---

**Cards & Panels**

| Variable | Description |
|----------|-------------|
| `--boomi-card-bg` | Card background |
| `--boomi-card-border` | Card border color |
| `--boomi-card-shadow` | Card box shadow |
| `--boomi-card-hover-shadow` | Shadow on hover |
| `--boomi-card-radius` | Card border radius |
| `--boomi-card-hover-scale` | Scale transform on hover (e.g., `1.01`) |

---

**Header & Navigation**

| Variable | Description |
|----------|-------------|
| `--boomi-header-bg-color` | Top bar background color |
| `--boomi-header-fg-color` | Top bar text/icon color |
| `--boomi-header-shadow` | Top bar shadow |
| `--boomi-header-border-color` | Top bar bottom border |

---

**Menus & Dropdowns**

| Variable | Description |
|----------|-------------|
| `--boomi-menu-bg` | Dropdown menu background |
| `--boomi-menu-fg` | Menu text color |
| `--boomi-menu-border` | Menu border color |
| `--boomi-menu-shadow` | Menu shadow |
| `--boomi-menu-radius` | Menu border radius |
| `--boomi-menu-item-bg-hover` | Menu item background on hover |
| `--boomi-menu-item-fg-hover` | Menu item text on hover |
| `--boomi-menu-item-outline` | Focus outline on menu items |
| `--boomi-menu-item-radius` | Menu item border radius |
| `--boomi-menu-divider` | Separator line color |
| `--boomi-menu-font-size` | Font size inside menus |
| `--boomi-menu-icon-opacity` | Opacity of icons in menu items |

---

**Modals & Overlays**

| Variable | Description |
|----------|-------------|
| `--boomi-modal-bg` | Modal dialog background |
| `--boomi-modal-fg` | Modal text color |
| `--boomi-modal-border` | Modal border |
| `--boomi-modal-shadow` | Modal box shadow |
| `--boomi-modal-overlay-bg` | Semi-transparent overlay behind modal |
| `--boomi-modal-close-fg` | Close button color |
| `--boomi-modal-close-hover-fg` | Close button color on hover |

---

**Agent Chat Window**

These variables specifically control the agent chat panel.

| Variable | Description |
|----------|-------------|
| `--boomi-agent-bg` | Chat window background |
| `--boomi-agent-fg` | Chat window text color |
| `--boomi-agent-border` | Chat window border |
| `--boomi-agent-radius` | Chat window corner radius |
| `--boomi-agent-shadow` | Chat window shadow |
| `--boomi-agent-header-bg` | Header strip above chat area |
| `--boomi-agent-header-border` | Header bottom border |
| `--boomi-agent-chat-bg` | Chat message area background |
| `--boomi-agent-chat-fg` | Chat message area text |
| `--boomi-agent-chat-border` | Chat area border |
| `--boomi-agent-bubble-user-bg` | User message bubble background |
| `--boomi-agent-bubble-user-fg` | User message text color |
| `--boomi-agent-bubble-user-border` | User message bubble border |
| `--boomi-agent-bubble-agent-bg` | Agent message bubble background |
| `--boomi-agent-bubble-agent-fg` | Agent message text color |
| `--boomi-agent-bubble-agent-border` | Agent message bubble border |
| `--boomi-agent-compose-bg` | Compose bar background |
| `--boomi-agent-compose-border` | Compose bar border |
| `--boomi-agent-compose-shadow` | Compose bar shadow |
| `--boomi-agent-pane-bg-color` | Side pane background |
| `--boomi-agent-pane-fg-color` | Side pane text |
| `--boomi-agent-tab-bg` | Tab bar background |
| `--boomi-agent-tab-bg-active` | Active tab background |
| `--boomi-agent-tab-fg` | Tab text color |
| `--boomi-agent-tab-fg-active` | Active tab text color |
| `--boomi-agent-tab-border-active` | Active tab underline/border |

---

**Notices & Alerts**

| Variable | Description |
|----------|-------------|
| `--boomi-notice-success-bg` | Success notice background |
| `--boomi-notice-success-fg` | Success notice text |
| `--boomi-notice-success-border` | Success notice border |
| `--boomi-notice-error-bg` | Error notice background |
| `--boomi-notice-error-fg` | Error notice text |
| `--boomi-notice-error-border` | Error notice border |
| `--boomi-notice-warning-bg` | Warning notice background |
| `--boomi-notice-warning-fg` | Warning notice text |
| `--boomi-notice-warning-border` | Warning notice border |
| `--boomi-notice-shadow` | Shadow on all notice types |

---

**Tables**

| Variable | Description |
|----------|-------------|
| `--boomi-table-header-bg` | Table header row background |
| `--boomi-table-header-fg` | Table header text |
| `--boomi-table-header-border` | Header border |
| `--boomi-table-row-odd-bg` | Odd row background (zebra striping) |
| `--boomi-table-row-even-bg` | Even row background |
| `--boomi-table-row-hover-shadow` | Row shadow on hover |

---

**Typography & Utilities**

| Variable | Description |
|----------|-------------|
| `--boomi-font` | Base font-family stack |
| `--boomi-accent` | Accent/highlight color (links, focus rings, badges) |
| `--boomi-muted` | Muted text / disabled element color |
| `--boomi-danger` | Danger/destructive action color |
| `--boomi-danger-fg` | Danger text color |
| `--boomi-danger-bg` | Danger background |
| `--boomi-danger-border` | Danger border |

---

**Scrollbar**

| Variable | Description |
|----------|-------------|
| `--boomi-scrollbar-thumb` | Scrollbar thumb color |
| `--boomi-scrollbar-bg` | Scrollbar track background |
| `--boomi-scrollbar-width` | Scrollbar width |
| `--boomi-scrollbar-radius` | Scrollbar thumb border radius |

---

**Loading States**

| Variable | Description |
|----------|-------------|
| `--boomi-loader-dot-color` | Typing indicator dot color |
| `--boomi-loader-dot-opacity` | Dot opacity |
| `--boomi-loader-dot-size` | Dot size |
| `--boomi-spinner-border` | Spinner ring border color |
| `--boomi-spinner-overlay` | Overlay behind spinner |

---

### Full Configuration Reference

Below is a complete example project configuration in JSON, covering all available options. In the Admin Console Builder this is shown under the **JSON** tab.

```json
{
  "transport": "boomi-direct",

  "theme": {
    "allowThemes": true,
    "defaultTheme": "boomi"
  },

  "cssVarsByTheme": {
    "my-brand": {
      "--boomi-root-bg-color": "#0f172a",
      "--boomi-root-fg-color": "#e5e7eb",
      "--boomi-page-bg-color": "#0f172a",
      "--boomi-page-fg-color": "#e5e7eb",
      "--boomi-header-bg-color": "rgba(15, 23, 42, 0.9)",
      "--boomi-header-fg-color": "#e5e7eb",
      "--boomi-btn-primary-bg": "#2563eb",
      "--boomi-btn-primary-fg": "#ffffff",
      "--boomi-btn-primary-bg-hover": "#1d4ed8",
      "--boomi-card-bg": "#1e293b",
      "--boomi-card-border": "#334155",
      "--boomi-input-bg": "#0f172a",
      "--boomi-input-fg": "#e5e7eb",
      "--boomi-input-border": "#334155",
      "--boomi-modal-bg": "#1e293b",
      "--boomi-modal-fg": "#e5e7eb",
      "--boomi-agent-bg": "#1e293b",
      "--boomi-agent-fg": "#e5e7eb",
      "--boomi-agent-bubble-user-bg": "#2563eb",
      "--boomi-agent-bubble-user-fg": "#ffffff",
      "--boomi-agent-bubble-agent-bg": "#334155",
      "--boomi-agent-bubble-agent-fg": "#e5e7eb",
      "--boomi-accent": "#3b82f6",
      "--boomi-muted": "#64748b"
    }
  },

  "agents": {
    "YOUR_BOOMI_AGENT_ID": {
      "transport": "boomi-direct",

      "position": {
        "corner": "bottom-right",
        "offsetX": 20,
        "offsetY": 40
      },
      "shape": "pill",
      "label": "Chat with us",
      "icon": "🤖",
      "hideIcon": false,

      "ui": {
        "mode": "modal",
        "sessionScope": "mount",

        "welcome": {
          "title": "Hello! 👋",
          "subtitle": "How can I help you today?"
        },

        "prompts": [
          { "title": "Get started", "prompt": "What can you help me with?" },
          { "title": "Contact support", "prompt": "I need to speak with someone." }
        ],

        "modal": {
          "width": 600,
          "height": 700,
          "position": {
            "corner": "bottom-right",
            "offsetX": 20,
            "offsetY": 100
          }
        },

        "sidebar": {
          "show": false,
          "width": 280
        },

        "allowFreeTextPrompt": true,

        "fileAttachmentSupported": false,
        "fileAttachmentRequired": false,
        "allowedFileExtensions": [".csv", ".xlsx", ".pdf"],
        "maxFiles": 5,
        "maxTotalBytes": 10485760
      }
    }
  },

  "project": {
    "embedType": "single",
    "agentIds": ["YOUR_BOOMI_AGENT_ID"]
  }
}
```

#### Multi-Agent Tiles Example

```json
{
  "transport": "boomi-direct",
  "theme": { "allowThemes": true, "defaultTheme": "boomi" },

  "components": {
    "agentTiles": {
      "header": {
        "show": true,
        "title": "Available Agents",
        "description": "Browse and launch an AI agent."
      },
      "search": { "show": true },
      "viewToggle": { "show": true }
    }
  },

  "agents": {
    "AGENT_ID_1": {
      "transport": "boomi-direct",
      "label": "Data Analysis",
      "icon": "📊",
      "hideIcon": false,
      "buttonLabel": "Launch",
      "ui": {
        "mode": "modal",
        "sessionScope": "multi",
        "pageDescription": "Analyze your data with AI assistance.",
        "welcome": { "title": "Data Analysis", "subtitle": "Upload a file or describe what you need." },
        "modal": { "width": 800, "height": 700, "position": { "corner": "bottom-right", "offsetX": 20, "offsetY": 40 } },
        "sidebar": { "show": true, "width": 280 }
      }
    },
    "AGENT_ID_2": {
      "transport": "boomi-direct",
      "label": "Customer Support",
      "icon": "💬",
      "hideIcon": false,
      "buttonLabel": "Launch",
      "ui": {
        "mode": "modal",
        "sessionScope": "mount",
        "pageDescription": "Get help with your account or orders.",
        "welcome": { "title": "Customer Support", "subtitle": "I'm here to help." },
        "modal": { "width": 600, "height": 700, "position": { "corner": "bottom-right", "offsetX": 20, "offsetY": 40 } },
        "sidebar": { "show": false, "width": 280 }
      }
    }
  },

  "project": {
    "embedType": "tiles",
    "agentIds": ["AGENT_ID_1", "AGENT_ID_2"]
  }
}
```

#### Multi-Agent List (Pill + Modal) Example

```json
{
  "transport": "boomi-direct",
  "theme": { "allowThemes": true, "defaultTheme": "boomi" },

  "components": {
    "agentList": {
      "launcher": {
        "position": { "corner": "bottom-right", "offsetX": 20, "offsetY": 40 },
        "shape": "pill",
        "label": "Find an Agent",
        "icon": "🤖",
        "hideIcon": false
      },
      "modal": {
        "width": 500,
        "height": 600,
        "position": { "corner": "bottom-right", "offsetX": 20, "offsetY": 100 }
      },
      "welcome": {
        "title": "Agents",
        "subtitle": "Search for an agent and click to launch."
      }
    }
  },

  "agents": {
    "AGENT_ID_1": {
      "transport": "boomi-direct",
      "label": "Data Analysis",
      "icon": "📊",
      "hideIcon": false,
      "ui": {
        "mode": "modal",
        "sessionScope": "multi",
        "welcome": { "title": "Data Analysis", "subtitle": "What would you like to analyze?" },
        "modal": { "width": 800, "height": 700, "position": { "corner": "bottom-right", "offsetX": 20, "offsetY": 40 } },
        "sidebar": { "show": true, "width": 280 }
      }
    }
  },

  "project": {
    "embedType": "list",
    "agentIds": ["AGENT_ID_1"]
  }
}
```

---

## 6. Adding the CDN Script to Your Website

Once you have created a project and have your public token, adding the embed to your website is a two-step snippet.

### Quick Start

Add the following to any HTML page, just before `</body>`:

```html
<!-- 1. EmbedKit Stylesheet -->
<link rel="stylesheet" href="https://cdn.boomi.space/cdn/embedkit-cdn.css" />

<!-- 2. Configure the embed -->
<script>
  window.BoomiEmbed = {
    publicToken: "pk_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    agentId: "project_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    mountId: "boomi-agent",
    serverBase: "https://api.boomi.space/api/v1"
  };
</script>

<!-- 3. Load the CDN bundle -->
<script src="https://cdn.boomi.space/embedkit-cdn.umd.cjs" async></script>

<!-- 4. Mount target element -->
<div id="boomi-agent"></div>
```

Replace `publicToken` and `agentId` with the values from the Admin Console after creating your project.

---

### Configuration Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `publicToken` | `string` | **Yes** | The `pk_...` token from your project in Admin Console |
| `agentId` | `string` | **Yes** | The project ID (`project_...`) from Admin Console |
| `serverBase` | `string` | **Yes** | EmbedKit API base URL: `https://api.boomi.space/api/v1` |
| `mountId` | `string` | No | ID of the `<div>` to mount into. Defaults to `"boomi-agent"` |
| `userId` | `string` | No | An identifier for the current user (for analytics / session tracking) |
| `origin` | `string` | No | Override the detected origin. Defaults to `window.location.origin` |
| `autoInit` | `boolean` | No | Set to `false` to disable automatic initialization. Default: `true` |

---

### Full Page Example

This is a complete, self-contained HTML page with the EmbedKit CDN embedded:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Website</title>

  <!-- EmbedKit Stylesheet -->
  <link rel="stylesheet" href="https://cdn.boomi.space/cdn/embedkit-cdn.css" />

  <style>
    /* Your existing site styles here */
    body {
      font-family: sans-serif;
      margin: 0;
      padding: 2rem;
    }
  </style>
</head>
<body>

  <h1>Welcome to Our Portal</h1>
  <p>Click the button in the bottom-right corner to chat with our AI assistant.</p>

  <!-- EmbedKit mount target -->
  <div id="boomi-agent"></div>

  <!-- Configure and load EmbedKit -->
  <script>
    window.BoomiEmbed = {
      publicToken: "pk_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      agentId:     "project_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      mountId:     "boomi-agent",
      serverBase:  "https://api.boomi.space/api/v1",

      // Optional: pass your user's ID for session tracking
      userId: "user-12345"
    };
  </script>
  <script src="https://cdn.boomi.space/embedkit-cdn.umd.cjs" async></script>

</body>
</html>
```

---

### WordPress Example

Add the following to your theme's `functions.php` or use a custom HTML block:

```php
// In functions.php:
function embedkit_cdn_enqueue() {
    wp_enqueue_style(
        'embedkit-css',
        'https://cdn.boomi.space/cdn/embedkit-cdn.css'
    );
    wp_enqueue_script(
        'embedkit-cdn',
        'https://cdn.boomi.space/embedkit-cdn.umd.cjs',
        [],
        null,
        true  // Load in footer
    );
    wp_add_inline_script('embedkit-cdn',
        'window.BoomiEmbed = {
            publicToken: "pk_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
            agentId: "project_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
            mountId: "boomi-agent",
            serverBase: "https://api.boomi.space/api/v1"
        };',
        'before'
    );
}
add_action('wp_enqueue_scripts', 'embedkit_cdn_enqueue');
```

Add `<div id="boomi-agent"></div>` wherever you want the agent to mount (typically your footer template or sidebar widget).

---

### Salesforce Experience Cloud / LWC Example

```html
<!-- In a custom HTML component or Experience Builder page -->
<link rel="stylesheet" href="https://cdn.boomi.space/cdn/embedkit-cdn.css" />

<script>
  window.BoomiEmbed = {
    publicToken: "pk_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    agentId:     "project_xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    mountId:     "boomi-agent",
    serverBase:  "https://api.boomi.space/api/v1"
  };
</script>
<script src="https://cdn.boomi.space/embedkit-cdn.umd.cjs"></script>

<div id="boomi-agent"></div>
```

---

### Using a Content Security Policy (CSP)

If your site uses a Content Security Policy, you will need to add the following directives:

```
Content-Security-Policy:
  script-src  'self' https://cdn.boomi.space;
  style-src   'self' https://cdn.boomi.space;
  connect-src 'self' https://api.boomi.space;
  frame-src   'none';
```

---

## 7. Advanced Options

### Manual Initialization

If you need to control when the agent initializes (e.g., after a user logs in or accepts a consent form), disable auto-init and call the embed manually:

```html
<script>
  window.BoomiEmbed = {
    publicToken: "pk_...",
    agentId:     "project_...",
    serverBase:  "https://api.boomi.space/api/v1",
    autoInit:    false
  };
</script>
<script src="https://cdn.boomi.space/embedkit-cdn.umd.cjs"></script>

<script>
  // Call this whenever you are ready to show the agent
  document.getElementById('launch-agent-btn').addEventListener('click', () => {
    BoomiEmbedKitCdn.BoomiPublicEmbed(window.BoomiEmbed);
  });
</script>
```

### Passing a User ID

The `userId` property lets you associate embed sessions with your users. This is useful for analytics, auditing, and session history:

```javascript
window.BoomiEmbed = {
  publicToken: "pk_...",
  agentId:     "project_...",
  serverBase:  "https://api.boomi.space/api/v1",
  userId:      "user-" + currentUser.id  // Your user's identifier
};
```

### Multiple Agents on the Same Page

If you have multiple `tiles` or `list` projects on the same page and need more than one mount point, the `mountId` property lets you target different containers:

```html
<div id="support-agent"></div>
<div id="data-agent"></div>

<script>
  // Not supported as multiple simultaneous embeds — use tiles or list embed type
  // to surface multiple agents within a single project instead.
</script>
```

> **Note:** A single page should have one `window.BoomiEmbed` config. Use the `tiles` or `list` embed type to surface multiple agents within a single project.

---

## 8. Troubleshooting

### Agent does not appear

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No error in console, nothing rendered | `mountId` does not match a `<div>` on the page | Ensure `<div id="boomi-agent"></div>` exists before the script runs |
| `403 Forbidden` in network tab | Origin not in CORS allowlist | Add your site's origin in Admin Console → CORS |
| `403 Forbidden` — "origin not allowed" | Origin allowed globally but not on this project | Edit the project and add the origin to its allowed origins |
| `404 Not Found` | Public token or project ID is wrong | Double-check values from Admin Console |
| `429 Too Many Requests` | Rate limit exceeded | Check the `Retry-After` response header; contact support to adjust limits |
| Script loads but nothing renders | `autoInit: false` set accidentally | Remove `autoInit` or call `BoomiEmbedKitCdn.BoomiPublicEmbed(...)` manually |

### Browser Console Errors

**`No 'Access-Control-Allow-Origin' header`**
→ Your origin is not registered. Go to Admin Console → CORS and add your site's URL.

**`Failed to fetch`**
→ The `serverBase` URL is wrong or the server is unreachable. Verify the URL includes `/api/v1`.

**`publicToken not found`**
→ The `publicToken` value is incorrect or the project was deleted. Get a fresh token from Admin Console.

### Local Development

When testing locally, make sure to add `http://localhost:PORT` (e.g., `http://localhost:3000`) to your CORS origins in the Admin Console. Note that `http://localhost` and `http://localhost:3000` are **different origins** and must each be added separately.

---

## Summary

| Step | Action | Where |
|------|--------|-------|
| 1 | Log in | [admin.boomi.space](https://admin.boomi.space) |
| 2 | Add CORS origins | Admin Console → CORS |
| 3 | Create project, configure UI | Admin Console → Projects |
| 4 | Copy public token + project ID | Token dialog after project creation |
| 5 | Add CSS link + config + script to website | Your HTML |
| 6 | Add `<div id="boomi-agent">` mount target | Your HTML |

---

📚 **Full API reference:** [Boomi EmbedKit Documentation](https://help.boomi.com/)
🛠️ **NPM package (for React apps):** See [GettingStarted.md](./GettingStarted.md)
📋 **Release notes:** See [ReleaseNotes.md](./ReleaseNotes.md)
