/**
 * @file agent-transport.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * Helpers for reasoning about an agent's transport.
 *
 * Two transports talk to a hosted agent runtime rather than to an installed
 * integration pack: `boomi-direct` (Boomi Agent Studio) and `companion-sdk`
 * (the Boomi Companion agent, a Claude Agent SDK loop in embedkit-server). Both
 * skip pack installation and the per-agent configuration UI, so the chat surface
 * treats them the same — hence one predicate instead of a comparison repeated at
 * every call site.
 */

import type { AgentConfig } from '../types/agent.config';

export type AgentTransport = NonNullable<AgentConfig['transport']>;

/**
 * True when the transport posts turns to a hosted agent endpoint, meaning there
 * is no integration pack to install or configure.
 */
export function isDirectTransport(transport?: AgentConfig['transport']): boolean {
  return transport === 'boomi-direct' || transport === 'companion-sdk';
}

/** True when the transport is the Boomi Companion (Claude Agent SDK) agent. */
export function isCompanionTransport(transport?: AgentConfig['transport']): boolean {
  return transport === 'companion-sdk';
}
