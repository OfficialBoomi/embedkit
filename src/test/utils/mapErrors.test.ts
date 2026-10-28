import { describe, it, expect } from 'vitest';
import {
  classifyMapError,
  describeFailedCandidates,
  MAP_ERROR_MESSAGES,
  SLOW_NO_RESPONSE_MS,
} from '../../utils/mapErrors';

const httpError = (status: number, message = 'boom') =>
  Object.assign(new Error(message), { status });

describe('classifyMapError', () => {
  it('treats a client timeout as a timeout', () => {
    const err = new DOMException('Request timed out', 'TimeoutError');
    expect(classifyMapError(err)).toEqual({ kind: 'timeout', message: MAP_ERROR_MESSAGES.timeout });
  });

  it('treats an abort as a timeout', () => {
    const err = new DOMException('aborted', 'AbortError');
    expect(classifyMapError(err).kind).toBe('timeout');
  });

  it('shows "could not reach the server" for a quick no-response failure', () => {
    expect(classifyMapError(httpError(0, 'Failed to fetch'), 400)).toEqual({
      kind: 'unreachable',
      message: MAP_ERROR_MESSAGES.unreachable,
    });
  });

  it('shows the timeout message for a slow no-response failure (hosted server cut-off)', () => {
    expect(classifyMapError(httpError(0, 'Failed to fetch'), 30_281).kind).toBe('timeout');
    expect(classifyMapError(httpError(0), SLOW_NO_RESPONSE_MS).kind).toBe('timeout');
    expect(classifyMapError(httpError(0), SLOW_NO_RESPONSE_MS - 1).kind).toBe('unreachable');
  });

  it.each([502, 503, 504])('maps %i to unavailable', (status) => {
    expect(classifyMapError(httpError(status))).toEqual({
      kind: 'unavailable',
      message: MAP_ERROR_MESSAGES.unavailable,
    });
  });

  it.each([500, 501, 599])('maps %i to a server error', (status) => {
    expect(classifyMapError(httpError(status)).kind).toBe('server');
  });

  it.each([401, 403])('maps %i to an expired session', (status) => {
    expect(classifyMapError(httpError(status))).toEqual({
      kind: 'session',
      message: MAP_ERROR_MESSAGES.session,
      code: 'TOKEN_REJECTED',
    });
  });

  it.each([400, 422])('passes the server message through for %i', (status) => {
    expect(classifyMapError(httpError(status, 'candidates must contain at least one item'))).toEqual({
      kind: 'request',
      message: 'candidates must contain at least one item',
    });
  });

  it('falls back to a generic message for a 4xx without text', () => {
    expect(classifyMapError(httpError(404, '')).message).toBe(MAP_ERROR_MESSAGES.generic);
  });

  it('keeps the message of an error that has no status', () => {
    expect(classifyMapError(new Error('Malformed JSON'))).toEqual({
      kind: 'unknown',
      message: 'Malformed JSON',
    });
  });

  it('treats a missing bearer token as an expired session', () => {
    expect(classifyMapError(new Error('MISSING_BEARER')).kind).toBe('session');
    const noSession = classifyMapError(Object.assign(new Error('anything'), { code: 'MISSING_BEARER' }));
    expect(noSession).toEqual({ kind: 'session', message: MAP_ERROR_MESSAGES.session, code: 'MISSING_BEARER' });
  });

  it('survives non-error values', () => {
    expect(classifyMapError(undefined).message).toBe(MAP_ERROR_MESSAGES.generic);
    expect(classifyMapError('nope').message).toBe(MAP_ERROR_MESSAGES.generic);
  });
});

describe('describeFailedCandidates', () => {
  it('names the connections when no reason is known', () => {
    const out = describeFailedCandidates([
      { connectionName: 'BoomiLabsAD' },
      { connectionName: 'BoomiLabsAD' },
    ]);
    expect(out.message).toBe(
      'We could not verify the value for BoomiLabsAD. Check it and try again. If it is correct, the runtime may be offline.'
    );
  });

  it('works without connection names', () => {
    expect(describeFailedCandidates([{}]).message).toContain('We could not verify the value.');
  });

  it('prefers a server-reported timeout', () => {
    expect(describeFailedCandidates([{ connectionName: 'A', failureReason: 'timeout' }]).kind).toBe('timeout');
  });

  it('prefers a server-reported outage', () => {
    expect(describeFailedCandidates([{ failureReason: 'unavailable' }]).kind).toBe('unavailable');
  });

  it('keeps the "could not verify" text for a rejected value', () => {
    expect(describeFailedCandidates([{ failureReason: 'rejected' }]).kind).toBe('request');
  });
});
