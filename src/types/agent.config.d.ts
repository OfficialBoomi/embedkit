/**
 * @file agent.config.d.ts
 * @typedef AgentConfig
 * @license Apache 2.0
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Defines configuration options for controlling the display and behavior of agent components.
 *
 */
import type { Component, IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { FormConfig } from './form.config';

export type AgentType = 'chat' | 'data';

/** A single feedback control (thumbs up / thumbs down / comment) */
export type AgentFeedbackControlConfig = {
  /** Show or hide this control (default: true) */
  show?: boolean;
  /** Optional custom icon (emoji/text) — falls back to the built-in icon */
  icon?: string;
  /** Accessible label / tooltip for the control */
  label?: string;
};

/**
 * Feedback (thumbs up / thumbs down / comment) on agent responses.
 *
 * Feedback is delivered as a 'feedback' event through the EmbedKit event
 * system — subscribe via BoomiPlugin({ onEvent }), BoomiEvents.on('feedback'),
 * or the 'boomi:event' DOM CustomEvent. EmbedKit never sends feedback over
 * the network itself; the host application owns the data.
 */
/**
 * Copy affordances on agent responses.
 *
 * The response-level control copies the original Markdown (not the rendered
 * text), so a pasted answer keeps its headings, tables and code fences.
 * Presentation is themable through the --boomi-agent-prose-copy-* CSS vars.
 */
/**
 * Stop / interrupt controls.
 *
 * While a turn is running the composer's primary action becomes Stop. If the
 * user has also typed something, an interrupt row appears beneath the input to
 * halt the turn and send that message instead — the only way to reach the agent
 * mid-turn, since sending is otherwise blocked.
 *
 * Only shown for transports that can actually halt a turn (`companion-sdk`);
 * transports that hand the turn to a remote runtime with no cancel channel
 * hide these controls rather than offering a button that does nothing.
 */
export type AgentStopConfig = {
  /** Show the stop and interrupt controls. Defaults to true. */
  show?: boolean;
  /** Label on the stop button. Defaults to 'Stop'. */
  label?: string;
  /** Label on the interrupt button. Defaults to 'Stop and send this instead'. */
  interruptLabel?: string;
  /** Explanatory text beside the interrupt button. */
  interruptHint?: string;
};

export type AgentCopyConfig = {
  /** Copy button on the whole response. Defaults to true. */
  showMessageCopy?: boolean;
  /** Copy button on each fenced code block. Defaults to true. */
  showCodeCopy?: boolean;
  /** Button label. Defaults to 'Copy'. */
  label?: string;
  /** Label shown briefly after a successful copy. Defaults to 'Copied'. */
  copiedLabel?: string;
};

export type AgentFeedbackConfig = {
  /**
   * Controls visibility. The feedback bar renders when a programmatic
   * subscriber is registered (onEvent / BoomiEvents) or when this is
   * explicitly true (needed when listening only via the DOM event).
   * Set false to hide the feedback bar regardless of subscribers.
   */
  enabled?: boolean;

  /** Thumbs-up control */
  thumbsUp?: AgentFeedbackControlConfig;

  /** Thumbs-down control */
  thumbsDown?: AgentFeedbackControlConfig;

  /** Free-text comment control */
  comment?: AgentFeedbackControlConfig & {
    /** Placeholder text for the comment box */
    placeholder?: string;
    /** Label on the comment submit button */
    submitLabel?: string;
    /** Accessible (screen reader) name for the comment textarea. Default: 'Feedback comment' */
    ariaLabel?: string;
  };

  /** Message shown after feedback is submitted */
  thanksText?: string;
};
export type AgentCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
export type UIPosition =
  | { corner: AgentCorner; offsetX?: number; offsetY?: number }
  | { x: number; y: number }; // absolute (fixed) positioning

/** ChatGPT-like UI options */
export type AgentUiConfig = {
  /** Session scope behavior for chat history */
  sessionScope?: 'mount' | 'multi';

  /** Optional unique key for the agent instance */
  pageShowHeader?: boolean;
  pageShowTitle?: boolean;
  pageTitle?: string;
  pageShowDescription?: boolean;
  pageDescription?: string;

  /** the welcome screen text */
  welcome: {
    title: string;
    subtitle: string;
  }

  /** 'full' fills parent; 'modal' renders a centered dialog; 'page' renders inline with no launcher */
  mode: 'modal' | 'full' | 'page';

  /** Sidebar options (left column) */
  sidebar?: {
    /** show or hide the sidebar */
    show?: boolean;
    /** Sidebar width in px (default: 300) */
    width?: number;
  };

  /** Modal sizing (only used when mode === 'modal') */
  modal?: {
    /** Width in px (default: 980) */
    width?: number;
    /** Height in px (default: 720) */
    height?: number;
    /** Override default centering and place the modal at a custom position */
    position?: UIPosition;
  };

  /**
   * Copy affordances on agent responses (response-level and per code block).
   * Both default to on; set `showMessageCopy: false` / `showCodeCopy: false`
   * to hide them.
   */
  copy?: AgentCopyConfig;

  /**
   * Stop / interrupt controls shown while a turn is running. Only rendered for
   * transports that can halt a turn.
   */
  stop?: AgentStopConfig;

  /** Allow user to enter free-text prompts */
  allowFreeTextPrompt?: boolean;

  /** Enable file uploads in MainChat */
  fileAttachmentSupported?: boolean;

  /** Require at least one file attached to send */
  fileAttachmentRequired?: boolean;

  /**
   * Allowed file extensions. Examples:
   * ".csv", ".xml", ".json"
   * or "csv,xml,json"
   */
  allowedFileExtensions?: string | string[];

  /** Soft gaurds on attachments */
  maxFiles?: number;  
  maxTotalBytes?: number;

  /** pre configured prompts */
  prompts?: Array<{
    title: string;
    prompt: string;
  }>;

  /** Horizontal alignment of prompt cards. Defaults to 'center'. */
  promptsAlign?: 'left' | 'center' | 'right';

  /** Where to render the prompt cards. 'input' = below the compose bar (default); 'welcome' = below the welcome title/subtitle. */
  promptsLocation?: 'input' | 'welcome';
};

export type AgentConfig = {
  /** Allow the user to expand the modal and sidebar to fill more of the screen */
  expandable?: boolean;

  /** The environment to use for this agent */
  allowFreeTextPrompts?: boolean;

  /** The environment to use for this agent */
  environmentId?: string;

  /** Optional Boomi Agent ID for boomi-direct transport */
  boomiAgentId?: string;

  /**
   * Optional Boomi Companion agent id for the `companion-sdk` transport. Falls
   * back to `boomiAgentId`, then to the integration pack id. The server keys its
   * per-agent Companion configuration (tool surface, model, skills) off this id.
   */
  companionAgentId?: string;

  /** is this a modal driven agent? */
  type?: AgentType;

  /** when set to false this will remove the agent from the integration pack install dropdown */
  allowInstall?: boolean;

  /** What name should this agent be installed as? */
  installAsName?: string;

  /** Floating trigger button placement (only relevant if you still use a launcher button) */
  position?: UIPosition;

  /** Floating trigger button shape */
  shape?: 'circle' | 'pill';

  /** Optional custom icon (emoji/text) for the launcher pill */
  icon?: string;

  /** Hide the launcher icon entirely */
  hideIcon?: boolean;

  /** Label shown on the pill button */
  label?: string;

  /** Label shown on the launch button in the agent list/tiles card */
  buttonLabel?: string;

  /** Default to multi-part request only. This will send the api requests as multi-part only. */
  sendMultipartData?: boolean;

  /**
   * How agent messages reach their runtime.
   *
   * - `boomi-proxy` (default): forwarded to the agent's installed integration pack.
   * - `boomi-direct`: posted to the Boomi Agent Studio session endpoint.
   * - `companion-sdk`: posted to the Boomi Companion agent in embedkit-server —
   *   a Claude Agent SDK loop running the Boomi Companion plugin skills. Replies
   *   arrive on the same SSE conversation channel as every other transport.
   */
  transport?: 'boomi-proxy' | 'boomi-direct' | 'companion-sdk';

  /** ChatGPT-style layout configuration */
  ui: AgentUiConfig;

  /** Feedback (thumbs up / thumbs down / comment) on agent responses */
  feedback?: AgentFeedbackConfig;

  /** Form configuration for agent configuration */
  form?: {
    configureAgent?: FormConfig;
  };
};
