/**
 * @file UpdateSchedules.tsx
 * @component UpdateSchedules
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A forwardRef functional component that renders UI for managing
 * process schedules of a Boomi integration pack. It handles loading
 * existing schedules, updating them via forms, and submitting changes.
 * The component supports loading and error states, and exposes
 * `submit` and `load` methods through the ref to allow parent components
 * to trigger form submission and data reload.
 *
 * @return {JSX.Element} The rendered update schedules form and controls.
 */

import {
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
  useEffect,
} from 'react';
import { usePlugin } from '../../context/pluginContext';
import { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { useFetchProcessSchedules } from '../../hooks/process-schedule/useFetchProcessSchedules';
import { useUpdateProcessSchedules } from '../../hooks/process-schedule/useUpdateProcessSchedules';
import AjaxLoader from '../ui/AjaxLoader';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import Page from '../core/Page';
import ScheduleForm, { ScheduleFormRef } from './ScheduleForm';
import logger from '../../logger.service';

/**
 * @typedef UpdateScheduleRef
 *
 * @description
 * Methods exposed via ref to parent components for controlling the `UpdateSchedules` component.
 *
 * @property {() => Promise<boolean>} submit - Submits the updated schedule. Returns `true` if successful.
 */
export type UpdateScheduleRef = {
  submit: () => Promise<boolean>;
};

/**
 * @interface UpdateSchedulesProps
 *
 * @description
 * Props for the `UpdateSchedules` component.
 *
 * @property {boolean} [componentKey] - Unique key for the component instance
 * @property {IntegrationPack} integration - The integration pack to update schedules for.
 * @property {(val: boolean) => void} [setIsLoading] - Optional callback to set loading state externally.
 * @property {() => void} [onSubmit] - Optional callback invoked after a successful submit.
 * @property {() => void} [onBack] - Optional callback invoked to navigate back in wizard mode.
 * @property {boolean} active - Whether this component is currently active/visible.
 * @property {boolean} wizard - Indicates if the component is used inside a wizard flow.
 */
export interface UpdateSchedulesProps {
  componentKey: string 
  integration: IntegrationPackInstance;
  setIsLoading?: (val: boolean) => void;
  onSubmit?: () => void;
  onBack?: () => void;
  active: boolean;
  wizard: boolean;
}

const UpdateSchedules = forwardRef<UpdateScheduleRef, UpdateSchedulesProps>(({ 
  componentKey,
  integration, 
  setIsLoading, 
  onSubmit, 
  onBack, 
  active, 
  wizard 
}, ref) => {
  const { setPageIsLoading, boomiConfig, renderComponent } = usePlugin();
  const formRef = useRef<ScheduleFormRef>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    schedule,
    isLoading,
    error: fetchError,
    fetchSchedules,
  } = useFetchProcessSchedules();
  const {
    updateProcessSchedules,
    isUpdating,
    updateError,  
  } = useUpdateProcessSchedules();

  const fetchData = async () => {
    try {
      logger.debug("Fetching schedules...", [], integration.environmentId, integration.id);
      await fetchSchedules(integration.environmentId || '', integration.id || '');
    } catch (err) {
      setApiError("Failed to fetch schedules.");
      logger.error("Failed to fetch schedules", err);
    }
  };

  useEffect(() => {
    if (active || !wizard) {
      fetchData();
    }
  }, [active, wizard]);

  const handleSubmit = async () => {
    setApiError(null);
    try {
      const payload = await formRef.current?.validateAndSubmit();
      if (!payload?.Schedule || !integration.environmentId) {
        logger.warn("Schedule form is invalid or missing environmentId");
        return false;
      }

      setIsLoading?.(true);
      await updateProcessSchedules(payload.Schedule, integration.environmentId, integration.id || '');
      setIsLoading?.(false);
      onSubmit?.();
      return true;
    } catch (err: any) {
      setIsLoading?.(false);
      const message = err?.message || 'Failed to update schedule.';
      logger.error('Schedule update error:', err);
      setApiError(message);
      return false;
    }
  };

  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
    load: fetchData,
  }));

  const handleRenderHome = (updated: boolean) => {
    renderComponent?.({
      component: 'Integrations',
      props: {
        componentKey: componentKey || 'integrationsMain'
      },
    });
  };

  const handleCancel = () => handleRenderHome(false);

  const handleSave = async () => {
    setPageIsLoading(true);
    const ok = await handleSubmit();
    if (!ok) return;
    handleRenderHome(true);
  };

  const showTitle = boomiConfig?.components?.[componentKey]?.updateSchedules?.showTitle ?? true;
  const showDescription = boomiConfig?.components?.[componentKey]?.updateSchedule?.showDescription ?? true;

  const panelTitle =
    boomiConfig?.components?.[componentKey]?.updateSchedule?.title || "Set Schedule";

  const panelDescription =
    boomiConfig?.components?.[componentKey]?.updateSchedule?.description ||
    `Please provide the necessary information to set up your schedule. For more details, refer to the product documentation <a class="boomi-link" target="_blank" href="https://help.boomi.com/docs/Atomsphere/Integration/Integration%20management/c-atm-Process_schedules_5d4ec467-f604-46ac-a546-f714a6a2d38e">Process Schedules</a>.`;

  const bodyContent = (
    <div className={`${wizard ? 'boomi-update-wizard': 'boomi-update'}`}>
      {showTitle && (
        <div className="boomi-update-title">
          {panelTitle}
        </div>
      )}

      {showDescription && (
        <div
          className="boomi-update-desc"
          dangerouslySetInnerHTML={{ __html: panelDescription }}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center items-center pt-6 m-6">
          <AjaxLoader message="Retrieving Schedule Information..." />
        </div>
      ) : (
        <div>
          {apiError && (
            <Dialog
              error={{
                header: "Error Updating Schedules",
                message: apiError,
                errorType: "error",
                onClose: () => {},
              }}
            />
          )}

          <div className="flex-1">
            <ScheduleForm
              ref={formRef}
              defaultSchedule={schedule ?? null}
              environmentId={integration.environmentId || ''}
            />
          </div>

          {!wizard && (
            <div className="boomi-update-actions">
              <Button
                toggle={false}
                primary={false}
                showIcon={false}
                label="Cancel"
                onClick={handleCancel}
              />
              <Button
                toggle={false}
                primary={true}
                showIcon={false}
                label="Save"
                onClick={handleSave}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
  if (!(active || !wizard)) {
    return null;
  }

  return !wizard ? (
    <Page
      componentKey={componentKey}
      componentName='setSchedule'
      isRootNavigation={false}
      title={`Update Schedule(s) ${integration.integrationPackOverrideName}`}
      description={integration.integrationPackDescription || ''}
      headerContent={<></>}
      bodyContent={bodyContent}
      footerContent={<></>}
      levelOne="My Integrations"
      callbackOne={onBack}
    />
  ) : (
    bodyContent
  );
});

UpdateSchedules.displayName = 'UpdateSchedules';
export default UpdateSchedules;
