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
