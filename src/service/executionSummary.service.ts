
import { useHttp } from './http';
import type { ExecutionSummaryRecordQueryResponse  } from '@boomi/embedkit-sdk';
import logger from '../logger.service';

export type GetExecutionRecordsArgs = {
  integrationPackInstanceId: string;
  search?: string;
  page?: number;   
  pageSize?: number;   
  signal?: AbortSignal;
};

export function useExecutionRecordsService() {
  const http = useHttp();

  async function getExecutionRecords(args: GetExecutionRecordsArgs): Promise<ExecutionSummaryRecordQueryResponse > {
    const { integrationPackInstanceId, search, page, pageSize, signal } = args;
    return http.get('/execution-summary-records', {
      signal,
      params: {
        integrationPackInstanceId,
        ...(search ? { search } : {}),
        ...(typeof page === 'number' ? { page } : {}),
        ...(typeof pageSize === 'number' ? { pageSize } : {}),
      },
    });
  }

  return { getExecutionRecords };
}
