
import { useCallback } from 'react';
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

  // Memoized so its identity is stable across renders. Consumers put this in
  // effect/callback dependency arrays; an unstable reference drives a fetch loop.
  const getExecutionRecords = useCallback(
    async (args: GetExecutionRecordsArgs): Promise<ExecutionSummaryRecordQueryResponse> => {
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
    },
    [http]
  );

  return { getExecutionRecords };
}
