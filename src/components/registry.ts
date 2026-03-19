/**
 * @file registry.ts
 * @class registry
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 * 
 * @description
 * React class component that catches JavaScript errors anywhere in its child component tree,
 */
import Integrations  from './integration/Integrations';
import Agent from './agent/RunAgent';

export const Components = {
  Integrations,
  Agent,
} as const;

export type KnownComponent = keyof typeof Components;

export type ComponentPropsMap = {
  [K in KnownComponent]: React.ComponentProps<typeof Components[K]>;
};
