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

  // Per-theme CSS variable overrides. Theme name is the key.
  // Add as many themes as you need; the plugin merges with its defaults.
  cssVarsByTheme: {
    // Example: a custom 'oem' theme. Trim/extend to taste.
    oem: {
      '--boomi-btn-primary-bg': '#6348c7',
      '--boomi-btn-primary-fg': '#ffffff',
      '--boomi-accent': '#6348c7',
      // ... add the rest of the --boomi-* vars you want to override
    },
  },
};
