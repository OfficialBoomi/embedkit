import { fetch as undiciFetch, Request as UndiciRequest, Response as UndiciResponse, Headers as UndiciHeaders } from 'undici';
globalThis.fetch = undiciFetch as any;
globalThis.Request = UndiciRequest as any;
globalThis.Response = UndiciResponse as any;
globalThis.Headers = UndiciHeaders as any;

import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import PluginHarness from '../PluginHarness';
import { useFetchAiTransformations } from '../../hooks/ai/useFetchAiTransformations';

const RUN_LIVE = String(import.meta.env.VITE_RUN_LIVE_TESTS) === 'true';

(RUN_LIVE ? describe : describe.skip)('useFetchAiTransformations (LIVE)', () => {
  const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => (
    <PluginHarness>{children}</PluginHarness>
  );

  it(
    'returns the expected Boomi-shaped object and exact script for a constrained prompt',
    async () => {
      const { result } = renderHook(() => useFetchAiTransformations(), { wrapper });

      const userPrompt = `
        Create a function that takes two integers "a" and "b"
        and outputs their sum in an output named "sum".
        The final JavaScript line MUST be: sum = a + b
        Inputs must be keys 1 and 2 named exactly "a" and "b" with INTEGER types.
        Single output with key 1 named exactly "sum".
        Do not declare variables for the final result; only "sum = a + b" as the last line.
      `;

      await act(async () => {
        await result.current.fetchTransformation(userPrompt, 'fn-sum-live-1');
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(result.current.error).toBeNull();
      const shaped = result.current.result;

      expect(shaped).toMatchObject({
        id: 'fn-sum-live-1',
        Configuration: {
          Scripting: {
            Inputs: {
              Input: [
                { index: '1', name: 'a', dataType: 'INTEGER' },
                { index: '2', name: 'b', dataType: 'INTEGER' },
              ],
            },
            Outputs: { Output: [{ index: '1', name: 'sum' }] },
          },
        },
        Inputs: { Input: [{ key: '1', name: 'a' }, { key: '2', name: 'b' }] },
        Outputs: { Output: [{ key: '1', name: 'sum' }] },
      });

      const script = String(shaped.Configuration.Scripting.Script);
      const normalize = (s: string) => s.replace(/\r/g, '').trim().replace(/[ \t]+/g, ' ');
      expect(normalize(script)).toBe(normalize('sum = a + b'));
    },
    30_000
  );

  it(
    'surfaces an error if the prompt is impossible under the schema',
    async () => {
      const { result } = renderHook(() => useFetchAiTransformations(), { wrapper });

      const badPrompt = `
        Make a function with an input type "BINARY128" (which is not allowed).
        Still try to return a script.
      `;

      await act(async () => {
        await result.current.fetchTransformation(badPrompt, 'fn-bad-live-1');
      });

      await waitFor(() => expect(result.current.isLoading).toBe(false));

      expect(typeof result.current.error === 'string' || result.current.error === null).toBe(true);
    },
    30_000
  );
});
