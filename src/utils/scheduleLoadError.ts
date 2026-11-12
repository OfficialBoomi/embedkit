/**
 * @file scheduleLoadError.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The words shown when the schedules of an integration could not be loaded. The raw error is built from
 * three layers (the SDK, the server and the hook) and names ids but no names, so the screen wraps it:
 *
 * - when the platform has no runtime attached to the environment (its "No atoms found" answer), a plain
 *   sentence that names the environment and says what to do;
 * - for any other failure, the environment first, then the reason exactly as it came.
 *
 * The environment is named from what the integration already carries (`environments`, each with an id and,
 * when the platform gave one, a name), so no extra request is made.
 */

export interface ScheduleEnvironmentRef {
  id?: string;
  name?: string;
}

export interface ScheduleLoadErrorSource {
  environmentId?: string;
  environments?: ScheduleEnvironmentRef[];
}

/** What the platform's answer says when an environment has no runtime attached. */
const NO_RUNTIME = /No atoms found for environmentId/i;

/** `"Name" (id)`, or just the id when the integration carries no name for it, or '' when there is no environment. */
export function describeEnvironment(source: ScheduleLoadErrorSource): string {
  const id = (source.environmentId || '').trim();
  if (!id) return '';
  const named = (source.environments ?? []).find((env) => env?.id === id);
  const name = (named?.name || '').trim();
  return name ? `"${name}" (${id})` : id;
}

/** The text for a failed load: a plain sentence for "no runtime attached", else the environment and the reason. */
export function describeScheduleLoadError(rawError: string, source: ScheduleLoadErrorSource): string {
  const environment = describeEnvironment(source);
  if (NO_RUNTIME.test(rawError)) {
    return environment
      ? `No runtime is attached to environment ${environment}. Attach one in Boomi.`
      : 'No runtime is attached to the environment of this integration. Attach one in Boomi.';
  }
  return environment ? `Environment ${environment}: ${rawError}` : rawError;
}
