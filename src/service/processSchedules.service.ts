import type { 
  Schedule,
  ProcessSchedules,
  ProcessSchedulesQueryResponse
 } from '@boomi/embedkit-sdk';
import { useHttp } from './http';
import logger from '../logger.service';

export type GetProcessSchedulesArgs = {
  integrationPackInstanceId: string;
  environmentId: string;
  signal?: AbortSignal;
};

export type UpdateProcessSchedulesArgs = {
  integrationPackInstanceId: string;
  environmentId: string;
  schedules: Schedule[];
};

export function useProcessSchedulesService() {
  const http = useHttp();

  async function getProcessSchedules(
    args: GetProcessSchedulesArgs
  ): Promise<ProcessSchedulesQueryResponse> {
    const { integrationPackInstanceId, environmentId, signal } = args;
    logger.debug('Fetching process schedules via service', args);
    return http.get('/process-schedules', {
      signal,
      params: {
        integrationPackInstanceId,
        environmentId,
      },
    });
  }

  async function updateProcessSchedules (
    args: UpdateProcessSchedulesArgs
  ): Promise<ProcessSchedules[]> {
    const { integrationPackInstanceId, environmentId, schedules } = args;
    logger.debug('updating map extension via service', integrationPackInstanceId, environmentId);
    return http.post('/process-schedules/update', {
      integrationPackInstanceId,
      environmentId,
      schedules
    });
  }



  return { getProcessSchedules, updateProcessSchedules};
}
