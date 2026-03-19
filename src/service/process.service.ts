
import { useHttp } from './http';
import logger from '../logger.service';

export type RunAllProcessesArgs = {
  integrationPackInstanceId: string;
  environmentId: string;
};

export function useProcessService() {
  const http = useHttp();

  async function runAllProcesses(
    args: RunAllProcessesArgs
  ): Promise<string[]> {
    const { integrationPackInstanceId, environmentId} = args;
    logger.debug('Running all processes via service', args);
    return http.post('/process/run-all', {
      integrationPackInstanceId,
      environmentId
    });
  }

  return { runAllProcesses };
}
