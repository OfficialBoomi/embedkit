/**
 * @file crtSaveError.test.ts
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * How a failed save or reset reads: the kind the screen acts on and the sentence the customer sees.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { classifySaveError } from '../../utils/crt/crtSave';
import { HttpError } from '../../service/http';
import { DEFAULT_SESSION_MESSAGE, setSessionMessage } from '../../utils/sessionError';

const http = (status: number, body?: unknown, message = 'failed'): HttpError => new HttpError(message, status, body);

describe('classifySaveError', () => {
  afterEach(() => setSessionMessage(undefined));

  it('409 TABLE_CHANGED is a conflict and carries the current stamp', () => {
    expect(classifySaveError(http(409, { error: 'x', code: 'TABLE_CHANGED', currentStamp: 'o2.abc' }))).toEqual({
      kind: 'conflict',
      message: 'This table was changed by someone else after you opened it.',
      currentStamp: 'o2.abc',
    });
  });

  it('a conflict without a usable current stamp has none', () => {
    expect('currentStamp' in classifySaveError(http(409, { code: 'TABLE_CHANGED' }))).toBe(false);
    expect('currentStamp' in classifySaveError(http(409, { code: 'TABLE_CHANGED', currentStamp: 5 }))).toBe(false);
  });

  it('409 TABLE_BUSY is busy', () => {
    expect(classifySaveError(http(409, { code: 'TABLE_BUSY' }))).toEqual({
      kind: 'busy',
      message: 'Another save of this table is still running. Try again in a moment.',
    });
  });

  it('413, or the code TOO_LARGE, is too large', () => {
    const expected = { kind: 'too-large', message: 'This table is too large to save.' };
    expect(classifySaveError(http(413, { code: 'TOO_LARGE' }))).toEqual(expected);
    expect(classifySaveError(http(413, '<html>Payload Too Large</html>'))).toEqual(expected);
    expect(classifySaveError(http(400, { code: 'TOO_LARGE' }))).toEqual(expected);
  });

  it('404 TABLE_NOT_FOUND means the table left the process', () => {
    expect(classifySaveError(http(404, { code: 'TABLE_NOT_FOUND', error: 'x' }))).toEqual({
      kind: 'not-found',
      message: 'This table is no longer part of this process, so it cannot be saved. Reload the screen.',
    });
  });

  it('404 without that code, or 501, means the server cannot save yet', () => {
    const expected = {
      kind: 'too-old',
      message: 'This server does not support saving cross reference tables yet. Update the embedkit server and try again.',
    };
    expect(classifySaveError(http(404, 'Not Found'))).toEqual(expected);
    expect(classifySaveError(http(404, { error: 'Cannot POST' }))).toEqual(expected);
    expect(classifySaveError(http(404))).toEqual(expected);
    expect(classifySaveError(http(501, { error: 'Cross reference tables need a newer SDK' }))).toEqual(expected);
  });

  it('502 SAVE_NOT_VERIFIED and BOOMI_REJECTED', () => {
    expect(classifySaveError(http(502, { code: 'SAVE_NOT_VERIFIED' }))).toEqual({
      kind: 'not-verified',
      message: 'Boomi accepted the save but the table does not read back as saved. Check the table and try again.',
    });
    expect(classifySaveError(http(502, { code: 'BOOMI_REJECTED' }))).toEqual({
      kind: 'rejected',
      message: 'Boomi did not accept the save. Check that the API token can edit environment extensions.',
    });
  });

  it('503, 429 and THROTTLED are throttled', () => {
    const expected = { kind: 'throttled', message: 'Boomi is busy right now. Try again in a moment.' };
    expect(classifySaveError(http(503, { code: 'THROTTLED' }))).toEqual(expected);
    expect(classifySaveError(http(503, 'Service Unavailable'))).toEqual(expected);
    expect(classifySaveError(http(429))).toEqual(expected);
    expect(classifySaveError(http(502, { code: 'THROTTLED' }))).toEqual(expected);
  });

  it('400 is invalid and uses the server text', () => {
    expect(classifySaveError(http(400, { error: 'Row 3 has 5 cells but the table has 4 columns.', code: 'INVALID_REQUEST' }))).toEqual({
      kind: 'invalid',
      message: 'Row 3 has 5 cells but the table has 4 columns.',
    });
  });

  it('400 without a text of its own uses the error message, then a plain sentence', () => {
    expect(classifySaveError(http(400, 'bad', 'Bad row')).message).toBe('Bad row');
    expect(classifySaveError(http(400, undefined, 'HTTP 400')).message).toBe(
      'The server did not accept this table. Check the values and try again.'
    );
  });

  it('status 0 is the network', () => {
    expect(classifySaveError(new HttpError('Failed to fetch', 0))).toEqual({
      kind: 'network',
      message: 'The server could not be reached. Check your connection and try again.',
    });
  });

  it('a session error is a session error, whatever else it carries', () => {
    expect(classifySaveError(new HttpError(DEFAULT_SESSION_MESSAGE, 401, { error: 'Invalid or expired token' }, 'TOKEN_REJECTED'))).toEqual({
      kind: 'session',
      message: DEFAULT_SESSION_MESSAGE,
    });
    expect(classifySaveError(Object.assign(new Error('There is no session'), { code: 'MISSING_BEARER' })).kind).toBe('session');
  });

  it('the session message is the host text when the host set one', () => {
    setSessionMessage('Please refresh this panel.');
    expect(classifySaveError(new HttpError('x', 401, undefined, 'TOKEN_REJECTED'))).toEqual({
      kind: 'session',
      message: 'Please refresh this panel.',
    });
  });

  it('anything else is other, with the server text when it has one', () => {
    expect(classifySaveError(http(500, { error: 'Something broke on the server' }))).toEqual({
      kind: 'other',
      message: 'Something broke on the server',
    });
    expect(classifySaveError(new Error('Malformed JSON'))).toEqual({ kind: 'other', message: 'Malformed JSON' });
    expect(classifySaveError('A plain text error')).toEqual({ kind: 'other', message: 'A plain text error' });
  });

  it('an unusable text gives a plain sentence instead: a web page, a bare status, a wall of text, nothing', () => {
    const generic = 'The table could not be saved. Try again.';
    expect(classifySaveError(http(500, '<html><body>Bad gateway</body></html>', '<html><body>Bad gateway</body></html>')).message).toBe(generic);
    expect(classifySaveError(http(500, undefined, 'HTTP 500')).message).toBe(generic);
    expect(classifySaveError(http(500, { error: 'x'.repeat(400) }, 'y'.repeat(400))).message).toBe(generic);
    expect(classifySaveError(http(500, { error: '   ' }, '')).message).toBe(generic);
    expect(classifySaveError(undefined).message).toBe(generic);
    expect(classifySaveError(null).message).toBe(generic);
    expect(classifySaveError({}).message).toBe(generic);
  });

  it('a 409 or 502 with no known code is other, not a conflict', () => {
    expect(classifySaveError(http(409, { error: 'Conflict' })).kind).toBe('other');
    expect(classifySaveError(http(502, { error: 'Bad gateway' })).kind).toBe('other');
  });

  it('reads a plain object with the same shape as an HttpError', () => {
    expect(classifySaveError({ status: 409, body: { code: 'TABLE_CHANGED', currentStamp: 'd0.x' }, message: 'm' })).toMatchObject({
      kind: 'conflict',
      currentStamp: 'd0.x',
    });
  });

  it('no message has a dash that is not a plain hyphen', () => {
    const errors = [
      http(409, { code: 'TABLE_CHANGED' }),
      http(409, { code: 'TABLE_BUSY' }),
      http(413),
      http(404, { code: 'TABLE_NOT_FOUND' }),
      http(404),
      http(502, { code: 'SAVE_NOT_VERIFIED' }),
      http(502, { code: 'BOOMI_REJECTED' }),
      http(503),
      new HttpError('x', 0),
      http(500),
    ];
    for (const err of errors) expect(classifySaveError(err).message).not.toMatch(/[\u2013\u2014]/);
  });
});
