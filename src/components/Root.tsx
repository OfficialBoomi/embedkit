/**
 * @file Root.tsx
 * @component Root
 * @license BSD-2-Clause
 *
 * @description
 * Lightweight container for dynamically loading and swapping components at runtime.
 * Authentication is handled elsewhere (PluginContext via JWT). Root simply
 * waits for the plugin to be "ready" and renders the requested component.
 */

import React, {
  useState,
  forwardRef,
  useImperativeHandle,
  useCallback,
  useMemo,
} from 'react';
import AjaxLoader from './ui/AjaxLoader';
import { usePlugin } from '../context/pluginContext';
import logger from '../logger.service';
import '../main.css';

/** Arbitrary props for dynamically rendered components */
type ComponentProps = Record<string, any>;

interface RootProps {
  initialComponent?: React.ComponentType<any>;
  initialProps?: ComponentProps;
}

export interface RootRef {
  updateComponent: (
    component: React.ComponentType<any>,
    props: ComponentProps,
    options?: { forceRemount?: boolean }
  ) => void;
}

const Root = forwardRef<RootRef, RootProps>(function Root(props, ref) {
  const { initialComponent, initialProps } = props;
  const { isReady, boomiConfig } = usePlugin();

  const [CurrentComponent, setCurrentComponent] = useState<
    React.ComponentType<any> | null
  >(initialComponent ?? null);

  const [currentProps, setCurrentProps] = useState<ComponentProps>(
    initialProps ?? {}
  );

  const [key, setKey] = useState(0);

  const updateComponent = useCallback(
    <P extends ComponentProps>(
      component: React.ComponentType<P>,
      nextProps?: P,
      options?: { forceRemount?: boolean }
    ) => {
      logger.debug('Root updateComponent called with props:', nextProps);
      setCurrentComponent(() => component as React.ComponentType<any>);
      setCurrentProps((nextProps ?? {}) as ComponentProps);
      if (options?.forceRemount) {
        setKey((prev) => prev + 1);
      } else {
        // Even without forceRemount, bump the key when the component identity changes
        setKey((prev) => prev + 1);
      }
    },
    []
  );

  useImperativeHandle(ref, () => ({ updateComponent }), [updateComponent]);
  const componentName = (currentProps as any)?.__componentName;
  const integrationKey =
    (currentProps as any)?.integrationPackId ??
    (currentProps as any)?.integration?.integrationPackId ??
    (currentProps as any)?.integration?.id ??
    (currentProps as any)?.componentKey ??
    undefined;
  const agentMode =
    componentName === 'Agent'
      ? boomiConfig?.agents?.[integrationKey]?.ui?.mode
      : undefined;

  const cleanProps = useMemo(() => {
    const copy = { ...currentProps };
    if ('__componentName' in copy) delete (copy as any).__componentName;
    return copy;
  }, [currentProps]);

  // Wait until PluginContext reports ready (JWT acquired / config loaded, etc.)
  if (!isReady) {
    return (
      <div
        className="
          boomi-plugin-root
          w-full pt-4
          flex items-center justify-center
          [background-color:var(--boomi-root-bg-color)]
          [color:var(--boomi-root-fg-color)]
        "
      >
        <div className="max-w-xl w-full [background-color:var(--boomi-page-bg-color)]">
          <AjaxLoader message="Loading..." />
        </div>
      </div>
    );
  }

  // If nothing has been asked to render yet, show a simple ready screen
  if (!CurrentComponent) {
    return (
      <div
        className="
          boomi-plugin-root
          w-full min-h-full
          flex items-center justify-center
          [background-color:var(--boomi-root-bg-color)]
          [color:var(--boomi-root-fg-color)]
          p-6
        "
      >
        <div className="max-w-xl w-full rounded-2xl shadow-lg p-6 [background-color:var(--boomi-page-bg-color)]">
          <h2 className="text-xl font-semibold mb-2">
            Plugin Ready
          </h2>
          <p className="opacity-80 mb-4">
            Authentication is complete. Waiting to render a component.
          </p>
        </div>
      </div>
    );
  }

  if (componentName === 'Agent' && agentMode === 'modal') {
    return <CurrentComponent key={key} {...cleanProps} />;
  }

  return (
    <div
      className="
        boomi-plugin-root
        relative
        w-full h-full min-h-full
        overflow-auto boomi-scroll
        [background-color:var(--boomi-root-bg-color)]
        [color:var(--boomi-root-fg-color)]
      "
    >
      <CurrentComponent key={key} {...cleanProps} />
    </div>
  );
});

export default Root;
