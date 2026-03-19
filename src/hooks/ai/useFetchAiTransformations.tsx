/**
 * @file useFetchAiTransformations.tsx
 * @function useFetchAiTransformations
 * @license BSD-2-Clause
 * @support https://github.com/OfficialBoomi/embed-js
 */

import { useState } from 'react';
import { useAiService } from '../../service/ai.service';
import {
  TransformationStructuredOutput
} from  '@boomi/embedkit-sdk';
import logger from '../../logger.service';
/**
 * Generates Boomi-compatible transformation functions via OpenAI:
 *  1) Reads AI config (enabled, model, apiKey) from context.
 *  2) Sends a structured prompt to produce name, script, inputs, outputs.
 *  3) Validates the response against `AiTransformation` (zod).
 *  4) Shapes the result into Boomi `MapExtensionsFunction` format.
 *
 * @return {{
 *   result: any | null;
 *   isLoading: boolean;
 *   error: string | null;
 *   fetchTransformation: (userPrompt: string, id: string) => Promise<any | void>;
 * }}
 *   Hook API with the latest generated result, loading/error state, and an invoker.
 *
 * @throws {Error}
 *   When AI is enabled but model or apiKey is missing in context.
 */
export const useFetchAiTransformations = () => {
  const [result, setResult] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { buildAiTransformation } = useAiService();

  /**
   * @function fetchTransformation
   * 
   * @description
   * Requests an AI-generated transformation for a natural-language prompt and
   * adapts it to Boomi’s map extension function structure.
   * 
   * @returns {Promise<any|void>} Resolves with the structured Boomi transformation object on success.
   * 
   * @throws {Error} If AI is enabled but not fully configured (missing model or apiKey).
   */
  const fetchTransformation = async (
    /** Natural language description of the desired transformation. */
    userPrompt: string, 
    
    /** Identifier to assign to the resulting Boomi function. */
    id: string
  ) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      logger.debug('Requesting AI transformation for prompt:', userPrompt);
      const structuredOutput = await buildAiTransformation({ id, userPrompt });
      logger.debug('Structured output:', structuredOutput);
      setResult(structuredOutput);
      return structuredOutput;
    } catch (err: any) {
      const message = err?.message || 'An unexpected error occurred.';
      logger.error('AI transformation error:', message, err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    result,
    isLoading,
    error,
    fetchTransformation,
  };
};
