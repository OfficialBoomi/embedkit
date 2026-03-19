import type { TransformationStructuredOutput } from '@boomi/embedkit-sdk';
import { useHttp } from './http';
import logger from '../logger.service';

export type BuildAiTransformationArgs = {
    /** Identifier to assign to the resulting Boomi function. */
    id: string,
    /** Natural language description of the desired transformation. */
    userPrompt: string
};

export function useAiService() {
  const http = useHttp();

  async function buildAiTransformation (
    args: BuildAiTransformationArgs
  ): Promise<TransformationStructuredOutput> {
    const { id, userPrompt } = args;
    logger.debug('bulding transformation extension via service', id);
    return http.post('/ai/build-transformation', {
      id, 
      userPrompt
    });
  }

  return { buildAiTransformation };
}

