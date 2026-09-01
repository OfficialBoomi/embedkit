// =========================================================================
// boomi.config.example.js
// Copy to boomi.config.js (git-ignored) and customize for your local dev.
// This is the runtime config passed to BoomiPlugin({ boomiConfig: ... }).
//
// Only override the keys you care about — anything you omit falls back
// to the plugin's built-in defaults.
// =========================================================================

export default {
  enableAi: true,

  theme: {
    allowThemes: true,
    defaultTheme: 'default',          // 'default' | 'oem' | any key in cssVarsByTheme
  },

  components: {
    // The "Agents" page (renderType: 'agent')
    agentsPage: {
      renderType: 'agent',
      modalOffset: { offsetX: 0, offsetY: 0 },
      integrations: {
        showHeader: true,
        defaultView: 'grid',          // 'grid' | 'list'
        header: {
          title: 'Agents',
          description: 'Explore our AI-powered agents to enhance your workflows.',
        },
      },
      mapping: { useTreeMode: true },
      form: {
        addIntegration: {
          title: 'Add New Agent',
          description: 'Select an agent to get started.',
          showEnvironmentSelect: false,
          defaultEnvironmentId: 'your-environment-id',
          integrationPackSelect: {
            label: 'Available Agents',
            loadingMessage: 'Loading Agents...',
          },
          integrationPackName: {
            editable: false,
            label: 'Agent Name',
          },
        },
      },
    },

    // The "Integrations" page (renderType: 'integration')
    integrationsPage: {
      renderType: 'integration',
      integrations: {
        showHeader: true,
        defaultView: 'grid',
        header: {
          title: 'Integrations',
          description: 'My Integrations',
        },
      },
      modalOffset: { offsetX: 0, offsetY: 0 },
      mapping: { useTreeMode: true },
    },
  },

  // Per-agent configuration, keyed by integration pack id (or public agent id).
  //
  // ---- Boomi Companion agent -------------------------------------------
  // `transport: 'companion-sdk'` routes this agent's turns to the Boomi
  // Companion in embedkit-server: a Claude Agent SDK loop that runs the Boomi
  // Companion plugin skills (bc-integration, bc-marketplace, ...). Replies come
  // back on the same SSE conversation channel as every other transport, so the
  // chat UI is unchanged, and like `boomi-direct` it needs no integration pack
  // install or per-agent configuration step.
  //
  // The agent's model, tool surface, and skill allowlist are NOT set here —
  // they live in the `ai.companion` block on the login POST (see
  // index.example.js), because granting an agent Bash/Write has to be a
  // server-side decision, not something the browser can ask for.
  //
  // agents: {
  //   'your-agent-id': {
  //     type: 'chat',
  //     transport: 'companion-sdk',
  //     // Optional: the id the server keys its per-agent Companion config off.
  //     // Defaults to boomiAgentId, then to this agent's own id.
  //     companionAgentId: 'your-agent-id',
  //     label: 'Ask the Boomi Companion',
  //     icon: '🧭',
  //     // File attachments are not supported on this transport yet.
  //     sendMultipartData: false,
  //     ui: {
  //       mode: 'modal',
  //       welcome: {
  //         title: 'Boomi Companion',
  //         subtitle: 'Ask me to build, inspect, or explain a Boomi integration.',
  //       },
  //       allowFreeTextPrompt: true,
  //       fileAttachmentSupported: false,
  //     },
  //   },
  // },
  //
  // agents: {
  //   'your-agent-id': {
  //     ui: {
  //       mode: 'modal',
  //       welcome: { title: "Let's Talk", subtitle: 'Ask me anything.' },
  //
  //       // Copy affordances on agent responses. The response-level button
  //       // copies the original Markdown (not the rendered text), so a pasted
  //       // answer keeps its headings, tables and code fences. Both default on.
  //       copy: {
  //         showMessageCopy: true,   // copy button on the whole response
  //         showCodeCopy: true,      // copy button on each fenced code block
  //         label: 'Copy',
  //         copiedLabel: 'Copied',
  //       },
  //     },
  //
  //     // Response feedback (thumbs up / thumbs down / comment).
  //     // Feedback is delivered to YOUR app as a standardized event — EmbedKit
  //     // never sends it anywhere itself. Subscribe with one of:
  //     //   BoomiPlugin({ onEvent: (event) => { ... } })
  //     //   BoomiEvents.on('feedback', (event) => { ... })
  //     //   window.addEventListener('boomi:event', (e) => e.detail)
  //     //
  //     // The feedback bar appears automatically when a programmatic
  //     // subscriber is registered. Set `enabled: true` when you only listen
  //     // via the DOM event; set `enabled: false` to always hide it.
  //     // All keys below are optional — this block just customizes the look.
  //     feedback: {
  //       thumbsUp:   { show: true, icon: '👍', label: 'Good response' },
  //       thumbsDown: { show: true, icon: '👎', label: 'Bad response' },
  //       comment: {
  //         show: true,
  //         // Placeholder text shown in the empty feedback comment box.
  //         // Style it with the --boomi-agent-feedback-placeholder-* CSS
  //         // vars in cssVars / cssVarsByTheme below.
  //         placeholder: 'Tell us more about this response…',
  //         submitLabel: 'Send Feedback',
  //       },
  //       thanksText: 'Thanks for your feedback!',
  //     },
  //   },
  // },

  // Global CSS variable overrides applied across every theme.
  // Anything you set here is merged on top of the plugin defaults and can be
  // further overridden per-theme in cssVarsByTheme below.
  cssVars: {
    // --- Chat composer backdrop -------------------------------------------
    // The panel painted behind the chat input so the conversation no longer
    // bleeds under the composer. Defaults below match the built-in look
    // (a soft transparent→solid fade with no divider line).
    '--boomi-agent-composer-backdrop-bg': 'var(--boomi-agent-pane-bg)',
    '--boomi-agent-composer-backdrop-fade': '2.5rem',     // height of the transparent→solid fade
    '--boomi-agent-composer-backdrop-line-width': '0',    // >0 to show a divider line
    '--boomi-agent-composer-backdrop-line-color':
      'var(--boomi-agent-chat-border, var(--boomi-card-border))',

    // Alternative "solid panel + thin line" look — use this for a hard panel
    // with a divider that extends slightly above the input:
    // '--boomi-agent-composer-backdrop-fade': '0px',
    // '--boomi-agent-composer-backdrop-line-width': '1px',

    // --- Agent response prose (Markdown) ---------------------------------
    // Agent answers are Markdown: headings, lists, tables, fenced code, and
    // long identifiers like connectorType="officialboomi-X3979C-rest-prod".
    // The defaults below are what the plugin ships; override any of them.
    //
    // Containment is deliberate and worth preserving if you restyle: tables
    // sit in their own horizontal scroll container and inline code uses
    // overflow-wrap: anywhere, which is what stops a long identifier pushing
    // the whole message wider than the chat pane.
    //
    // Base typography
    // '--boomi-agent-prose-font-size': '0.9375rem',
    // '--boomi-agent-prose-line-height': '1.65',
    // '--boomi-agent-prose-fg': 'var(--boomi-agent-pane-fg)',
    // '--boomi-agent-prose-p-margin': '0.6em 0',
    //
    // Headings — h1/h2/h3/h4 sizes, plus shared margin/weight/colour
    // '--boomi-agent-prose-h1-size': '1.4em',
    // '--boomi-agent-prose-h2-size': '1.25em',
    // '--boomi-agent-prose-h3-size': '1.1em',
    // '--boomi-agent-prose-h4-size': '1em',
    // '--boomi-agent-prose-heading-margin': '1.4em 0 0.5em',
    // '--boomi-agent-prose-heading-weight': '600',
    // '--boomi-agent-prose-heading-fg': 'inherit',
    //
    // Lists — bullet/number style, indent, spacing, marker colour
    // '--boomi-agent-prose-ul-style': 'disc',
    // '--boomi-agent-prose-ol-style': 'decimal',
    // '--boomi-agent-prose-list-indent': '1.4em',
    // '--boomi-agent-prose-list-margin': '0.6em 0',
    // '--boomi-agent-prose-li-margin': '0.25em 0',
    // '--boomi-agent-prose-marker-fg': 'var(--boomi-muted)',
    //
    // Inline text — links, emphasis, rules, quotes, images
    // '--boomi-agent-prose-link-fg': 'var(--boomi-accent)',
    // '--boomi-agent-prose-link-fg-hover': 'var(--boomi-accent)',
    // '--boomi-agent-prose-link-decoration': 'underline',
    // '--boomi-agent-prose-strong-weight': '600',
    // '--boomi-agent-prose-hr-color': ..., '--boomi-agent-prose-hr-margin': '1.25em 0',
    // '--boomi-agent-prose-quote-border': ..., '--boomi-agent-prose-quote-border-width': '3px',
    // '--boomi-agent-prose-quote-fg': ..., '--boomi-agent-prose-quote-margin': '0.8em 0',
    // '--boomi-agent-prose-quote-padding': '0.25em 0 0.25em 0.9em',
    // '--boomi-agent-prose-img-radius': '0.5rem',
    //
    // Inline code chips
    // '--boomi-agent-prose-code-bg': ..., '--boomi-agent-prose-code-fg': 'inherit',
    // '--boomi-agent-prose-code-border': 'transparent',
    // '--boomi-agent-prose-code-padding': '0.12em 0.35em',
    // '--boomi-agent-prose-code-radius': '0.3rem',
    // '--boomi-agent-prose-code-font': 'ui-monospace, SFMono-Regular, Menlo, …',
    // '--boomi-agent-prose-code-font-size': '0.875em',
    //
    // Fenced code blocks — frame, the language/copy header strip, and the code
    // '--boomi-agent-prose-pre-bg': ..., '--boomi-agent-prose-pre-border': ...,
    // '--boomi-agent-prose-pre-radius': '0.625rem',
    // '--boomi-agent-prose-pre-margin': '0.8em 0',
    // '--boomi-agent-prose-pre-padding': '0.75rem',
    // '--boomi-agent-prose-pre-font-size': '0.8125rem',
    // '--boomi-agent-prose-pre-line-height': '1.55',
    // '--boomi-agent-prose-pre-head-bg': ..., '--boomi-agent-prose-pre-head-padding': ...,
    // '--boomi-agent-prose-pre-lang-fg': ..., '--boomi-agent-prose-pre-lang-font-size': '0.6875rem',
    // '--boomi-agent-prose-pre-copy-bg' / '-bg-hover' / '-border',
    // '--boomi-agent-prose-pre-copy-fg' / '-fg-hover' / '-fg-copied',
    // '--boomi-agent-prose-pre-copy-padding' / '-radius' / '-font-size',
    //
    // Tables — frame, header row, cells, zebra striping
    // '--boomi-agent-prose-table-border': ..., '--boomi-agent-prose-table-radius': '0.625rem',
    // '--boomi-agent-prose-table-margin': '0.8em 0',
    // '--boomi-agent-prose-table-font-size': '0.875rem',
    // '--boomi-agent-prose-th-bg': ..., '--boomi-agent-prose-th-fg': 'inherit',
    // '--boomi-agent-prose-th-weight': '600',
    // '--boomi-agent-prose-cell-padding': '0.45rem 0.65rem',
    // '--boomi-agent-prose-cell-border': ...,
    // '--boomi-agent-prose-row-even-bg': 'transparent',   // set for zebra rows
    //
    // Response copy button. It fades in on hover by default; set idle-opacity
    // to 1 to pin it visible, or label-display to 'none' for an icon-only
    // button. (On touch devices it is always visible regardless.)
    // '--boomi-agent-prose-copy-idle-opacity': '0',
    // '--boomi-agent-prose-copy-label-display': 'inline',
    // '--boomi-agent-prose-copy-top': '-0.25rem', '--boomi-agent-prose-copy-right': '0',
    // '--boomi-agent-prose-copy-bg' / '-bg-hover' / '-border' / '-border-copied',
    // '--boomi-agent-prose-copy-fg' / '-fg-hover' / '-fg-copied',
    // '--boomi-agent-prose-copy-padding' / '-radius' / '-font-size',

    // --- Feedback comment placeholder ------------------------------------
    // Styles the placeholder text inside the feedback comment box
    // (the text itself is set per agent via agents.<id>.feedback.comment.placeholder).
    // '--boomi-agent-feedback-placeholder-fg': '#94a3b8',
    // '--boomi-agent-feedback-placeholder-opacity': '0.7',
    // '--boomi-agent-feedback-placeholder-style': 'italic',
  },

  // Per-theme CSS variable overrides. Theme name is the key.
  // Add as many themes as you need; the plugin merges with its defaults.
  cssVarsByTheme: {
    // Example: a custom 'oem' theme. Trim/extend to taste.
    oem: {
      '--boomi-btn-primary-bg': '#6348c7',
      '--boomi-btn-primary-fg': '#ffffff',
      '--boomi-accent': '#6348c7',
      // The composer backdrop is theme-aware too — e.g. give 'oem' a bold
      // inked divider line and a soft fade:
      '--boomi-agent-composer-backdrop-fade': '2rem',
      '--boomi-agent-composer-backdrop-line-width': '2px',
      '--boomi-agent-composer-backdrop-line-color': '#1a1a1a',
      // ... add the rest of the --boomi-* vars you want to override
    },
  },
};
