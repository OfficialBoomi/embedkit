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

  /** 'full' fills parent; 'modal' renders a centered dialog */
  mode: 'modal' | 'full';

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
};

export type AgentConfig = {
  /** The environment to use for this agent */
  allowFreeTextPrompts?: boolean;

  /** The environment to use for this agent */
  environmentId?: string;

  /** Optional Boomi Agent ID for boomi-direct transport */
  boomiAgentId?: string;

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

  /** Route agent messages via Boomi direct session endpoint. */
  transport?: 'boomi-proxy' | 'boomi-direct';

  /** ChatGPT-style layout configuration */
  ui: AgentUiConfig;

  /** Form configuration for agent configuration */
  form?: {
    configureAgent?: FormConfig;
  };
};
