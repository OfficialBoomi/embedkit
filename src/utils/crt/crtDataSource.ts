/**
 * @file crtDataSource.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The seam where the cross reference table screen can be handed its tables. Nothing is registered
 * by default, so the screen asks the server. A test can register a source to supply tables.
 * This file holds no fetch code.
 */
import type { CrtDataSource } from './crtTypes';

let activeSource: CrtDataSource | null = null;

/** Sets the source the screen reads from. Pass null to clear it. */
export function registerCrtDataSource(source: CrtDataSource | null): void {
  activeSource = source;
}

/** The registered source, or null when none is registered (the default). */
export function getCrtDataSource(): CrtDataSource | null {
  return activeSource;
}
