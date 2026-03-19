/**
 * @file UpdateMaps.tsx
 * @component UpdateMaps
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Renders UI for managing and updating environment map extensions within a Boomi integration pack.
 * Handles loading existing maps, updating mappings and transformation functions via the field mapping canvas,
 * and submitting changes to the backend. Supports loading and error states and can be used as a step within a wizard.
 *
 * @return {JSX.Element} The rendered UpdateMaps component.
 */

import { useState, useEffect, useRef } from 'react';
import classNames from 'classnames';
import { usePlugin } from '../../context/pluginContext';
import { IntegrationPackInstance } from '@boomi/embedkit-sdk';
import { PositionedFunction } from '../../types/positioned-function';
import { useFetchMapExtensions } from '../../hooks/map-extension/useFetchMapExtensions';
import { useUpdateMapExtensions } from '../../hooks/map-extension/useUpdateMapExtensions';
import { useExecuteMapExtensions } from '../../hooks/map-extension/useExecuteMapExtensions';
import AjaxLoader from '../ui/AjaxLoader';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import {
  EnvironmentMapExtension,
  MapExtensionBrowseSettings,
  MapExtensionsMapping,
} from '@boomi/embedkit-sdk';
import {
  stripYFromId,
  embedYInId,
  parseYFromId,
  toMapExtensionsFunctions,
  fromMapExtensionsFunctions,
} from '../../utils/ui-utils';
import EditTransformationsForm, {
  EditTransformationsFormRef,
} from './EditTransformationsForm';
import FieldMappingCanvas from './FieldMappingCanvas';
import FieldMappingCanvasTree from './FieldMappingCanvasTree';
import EditMapCandidateForm, { EditMapCandidateFormRef } from './EditMapCandidatesForm';
import Modal from '../ui/Modal';
import Page from '../core/Page';
import ToastNotification from '../ui/ToastNotification';
import logger from '../../logger.service';

/**
 * @interface UpdateMapsProps
 *
 * @description
 * Props for the `UpdateMaps` component.
 *
 * @property {boolean} [componentKey] - Unique key for the component instance
 * @property {boolean} active - Whether this component is currently active/visible.
 * @property {boolean} wizard - Indicates if the component is used inside a wizard flow.
 * @property {IntegrationPack} integration - The integration pack to update maps for.
 * @property {EnvironmentMapExtension[]} maps - The list of environment map extensions to display and edit.
 * @property {(updatedMaps: EnvironmentMapExtension[]) => void} [onMapsChange] - Optional callback invoked when the maps are updated.
 * @property {() => void} [onBack] - Optional callback invoked to navigate back.
 * @property {(val: boolean) => void} [setIsLoading] - Optional callback to set loading state externally.
 */
export interface UpdateMapsProps {
  componentKey: string
  active: boolean;
  wizard: boolean;
  integration: IntegrationPackInstance;
  onBack?: () => void;
  setIsLoading?: (val: boolean) => void;
}

const UpdateMaps: React.FC<UpdateMapsProps> = ({
  componentKey,
  active,
  wizard,
  integration,
  onBack,
  setIsLoading
}) => {
  const { boomiConfig, setPageIsLoading, renderComponent } = usePlugin();
  const { updateMapExtensions } = useUpdateMapExtensions();
  const [apiError, setApiError] = useState<string | null>(null);
  const {
    maps,
    isLoading,
    hasCandidates,
    mapCandidates,
    error: fetchError,
    fetchMapExtensions,
  } = useFetchMapExtensions();
  const [activeMapIndex, setActiveMapIndex] = useState(0);
  const currentMap = maps[activeMapIndex];
  const currentMapId = currentMap?.mapId as string;
  const [functionsByMapId, setFunctionsByMapId] =
    useState<Record<string, PositionedFunction[]>>({});
  const [mappingsByMapId, setMappingsByMapId] =
    useState<Record<string, MapExtensionsMapping[]>>({});
  const [editFunction, setEditFunction] = useState<PositionedFunction | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const formRef = useRef<EditTransformationsFormRef>(null);
  const [editName, setEditName] = useState('');
  const editCandidateFormRef = useRef<EditMapCandidateFormRef>(null);
  const [isCandidateModalOpen, setIsCandidateModalOpen] = useState(false);
  const { executeMapExtensions, updatedCandidates, isExecuting, executeError, extensions } =
    useExecuteMapExtensions();
  const [showAuthSuccess, setShowAuthSuccess] = useState(false);
  const sourceFields =
    currentMap?.Map?.SourceProfile?.Node?.filter((n) => n.xpath) ?? [];
  const targetFields =
    currentMap?.Map?.DestinationProfile?.Node?.filter((n) => n.xpath) ?? [];
  // feature flag for mapping tree
  const useTreeMap = boomiConfig?.components?.[componentKey]?.mapping?.useTreeMode ?? false;

  const runWithLoading = async <T,>(fn: () => Promise<T>): Promise<T> => {
    setIsLoading?.(true);
    setPageIsLoading?.(true);
    try {
      return await fn();
    } finally {
      setIsLoading?.(false);
      setPageIsLoading?.(false);
    }
  };

  const handleRenderHome = (updated: boolean) => {
    renderComponent?.({
      component: 'Integrations',
      props: { 
        componentKey: componentKey || 'integrationsMain'
      },
    });
  };

  const handleCancel = () => handleRenderHome(false);
  const handleSave = () => {
    setPageIsLoading?.(true);
    handleRenderHome(true);
  };

const handleCandidateSubmit = async (): Promise<boolean> => {
  return runWithLoading(async () => {
    const result = editCandidateFormRef.current?.validateAndSubmit();
    if (!result) return false;

    try {
      const failed = await executeMapExtensions(result.candidates);
      if (Array.isArray(failed) && failed.length > 0) {
        editCandidateFormRef.current?.applyErrorsFromCandidates(
          failed,
          'Please supply valid credentials and try again.'
        );
        return false;
      }
      setIsCandidateModalOpen(false);
      setPageIsLoading?.(true);
      await fetchData();
      setShowAuthSuccess(true);
      return true;
    } catch (err) {
      if (updatedCandidates?.length) {
        editCandidateFormRef.current?.applyErrorsFromCandidates(
          updatedCandidates,
          'Authentication Failed. Please supply valid credentials and try again.'
        );
      }
      return false;
    }
  });
};

  const handleCanvasMappingChange = async (newMappings: MapExtensionsMapping[]) => {
    await runWithLoading(async () => {
      const defaultBrowseSettings: MapExtensionBrowseSettings = {
        DestinationBrowse: {},
        SourceBrowse: {},
        containerId: undefined,
      };
      if (!currentMapId || !currentMap) return;
      const functions = functionsByMapId[currentMapId] || [];

      const { functions: updatedFunctions } = toMapExtensionsFunctions(functions);
      const updatedExtension: EnvironmentMapExtension = {
        ...currentMap,
        Map: {
          ...currentMap?.Map,
          BrowseSettings: defaultBrowseSettings,
          DestinationProfile: currentMap?.Map?.DestinationProfile ?? { Node: [] },
          DestinationProfileExtensions:
            currentMap?.Map?.DestinationProfileExtensions ?? { Node: [] },
          SourceProfile: currentMap?.Map?.SourceProfile ?? { Node: [] },
          SourceProfileExtensions:
            currentMap?.Map?.SourceProfileExtensions ?? { Node: [] },
          ExtendedFunctions: { Function: updatedFunctions },
          ExtendedMappings: { Mapping: newMappings },
        },
      };
      await updateMapExtensions(updatedExtension);
      setMappingsByMapId((prev) => ({ ...prev, [currentMapId]: newMappings }));
      const updatedMaps = maps.map((m) =>
        m.mapId === updatedExtension.mapId ? updatedExtension : m
      );

    }).catch((err: any) => setApiError(err?.message || 'Failed to update functions'));
  };

  const handleCanvasFunctionChange = async (
    updatedFunctions: PositionedFunction[],
    opts?: { mappingsOverride?: any[] }
  ) => {
    await runWithLoading(async () => {
      const defaultBrowseSettings: MapExtensionBrowseSettings = {
        DestinationBrowse: {},
        SourceBrowse: {},
        containerId: undefined,
      };
      if (!currentMapId || !currentMap) return;
      const baseMappings = opts?.mappingsOverride ?? (mappingsByMapId[currentMapId] || []);
      const { functions: newFunctions, idMap } = toMapExtensionsFunctions(updatedFunctions);

      const getFnId = (f: any) =>
        f?.id ?? f?.['@id'] ?? f?.FunctionId ?? f?.functionId ?? f?.Id;
      const allowedFunctionIds = new Set(
        (Array.isArray(newFunctions) ? newFunctions : []).map(getFnId).filter((v) => v != null)
      );
      const updatedMappings = baseMappings
        .map((m: any) => ({
          ...m,
          ...(m.fromFunction != null && idMap?.[m.fromFunction] != null
            ? { fromFunction: idMap[m.fromFunction] }
            : {}),
          ...(m.toFunction != null && idMap?.[m.toFunction] != null
            ? { toFunction: idMap[m.toFunction] }
            : {}),
        }))
        .filter((m: any) => {
          if (m.fromFunction != null && !allowedFunctionIds.has(m.fromFunction)) return false;
          if (m.toFunction != null && !allowedFunctionIds.has(m.toFunction)) return false;
          if (m.fromFunction && isNaN(Number(m.fromXPath))) return false;
          if (m.toFunction && isNaN(Number(m.toXPath))) return false;
          return true;
        });

      const updatedExtension: EnvironmentMapExtension = {
        ...currentMap,
        Map: {
          ...currentMap?.Map,
          BrowseSettings: defaultBrowseSettings,
          DestinationProfile: currentMap?.Map?.DestinationProfile ?? { Node: [] },
          DestinationProfileExtensions: currentMap?.Map?.DestinationProfileExtensions ?? { Node: [] },
          SourceProfile: currentMap?.Map?.SourceProfile ?? { Node: [] },
          SourceProfileExtensions: currentMap?.Map?.SourceProfileExtensions ?? { Node: [] },
          ExtendedFunctions: { Function: newFunctions },
          ExtendedMappings: { Mapping: updatedMappings },
        },
      };

      await updateMapExtensions(updatedExtension);
      setFunctionsByMapId((prev) => ({
        ...prev,
        [currentMapId]: fromMapExtensionsFunctions(newFunctions),
      }));
      setMappingsByMapId((prev) => ({
        ...prev,
        [currentMapId]: updatedMappings,
      }));
    }).catch((err: any) => setApiError(err?.message || 'Failed to update functions'));
  };

  const handleCanvasFunctionDelete = async (fn: PositionedFunction) => {
    await runWithLoading(async () => {
      const currentFunctions = functionsByMapId[currentMapId] || [];
      const currentMappings = mappingsByMapId[currentMapId] || [];

      const updatedFunctions = currentFunctions.filter((f) => f.id !== fn.id);
      const updatedMappings = currentMappings.filter(
        (m: any) => m.fromFunction !== fn.id && m.toFunction !== fn.id
      );
      await handleCanvasFunctionChange(updatedFunctions, { mappingsOverride: updatedMappings });
    }).catch((err: any) => setApiError(err?.message || 'Failed to delete functions'));
  };

  const handleEditSubmit = async (): Promise<boolean> => {
    if (!formRef.current || !currentMapId) return false;

    const result = formRef.current.validateAndSubmit();
    if (!result) return false;

    const fn: PositionedFunction = {
      id: editFunction?.id ?? '',
      newId: embedYInId(result.id, parseYFromId(editFunction?.id ?? '') ?? 0),
      name: result.id,
      script: result.script,
      inputs: result.inputs.map(({ name, key, type }) => ({ name, key, dataType: type })),
      outputs: result.outputs.map(({ name, key }) => ({ name, key })),
      type: 'Custom Scripting',
    };

    const updated = editFunction
      ? (functionsByMapId[currentMapId] || []).map((f) => (f.id === editFunction.id ? fn : f))
      : [...(functionsByMapId[currentMapId] || []), fn];

    try {
      await handleCanvasFunctionChange(updated);
      setEditFunction(null);
      setIsEditing(false);
    } catch (err: any) {
      setApiError(err.message || 'Failed to save transformation');
    } finally {
      setIsLoading?.(false);
    }
    return true;
  };

  const fetchData = async () => {
    try {
      logger.debug("Fetching maps...", [], integration.environmentId, integration.id);
      await fetchMapExtensions(integration.id || '', integration.environmentId || '');
    } catch (err) {
      setApiError("Failed to fetch maps.");
      logger.error("Failed to fetch maps", err);
    }
  };

  useEffect(() => {
    if (currentMap && currentMap?.Map && currentMapId) {
      setFunctionsByMapId((prev) => ({
        ...prev,
        [currentMapId]: fromMapExtensionsFunctions(
          currentMap.Map?.ExtendedFunctions?.Function ?? []
        ),
      }));
      setMappingsByMapId((prev) => ({
        ...prev,
        [currentMapId]: currentMap.Map?.ExtendedMappings?.Mapping ?? [],
      }));
    }
  }, [active, currentMap, currentMapId]);

  useEffect(() => {
    if (active || !wizard) {
      fetchData();
    }
  }, [active, wizard]);

  useEffect(() => {
    if (hasCandidates) setIsCandidateModalOpen(true);
  }, [hasCandidates]);

  const showTitle = boomiConfig?.components?.[componentKey]?.updateMaps?.showTitle ?? true;
  const showDescription = boomiConfig?.components?.[componentKey]?.updateMaps?.showDescription ?? true;

  const bodyContent = (
    <>
      {showAuthSuccess && <ToastNotification type="success" content={'Authentication Successful. Map has been updated.'} />}
      {isEditing && (
        <Modal
          isOpen={isEditing}
          title="Transformation Editor"
          description="Use this form to create or edit transformations."
          onClose={() => setIsEditing(false)}
          onSubmit={handleEditSubmit}
          submitLabel="Save"
        >
          <EditTransformationsForm
            componentKey={componentKey}
            ref={formRef}
            existingName={editName}
            existingScript={editFunction?.script ?? ''}
            existingInputs={editFunction?.inputs.map(({ key, name, dataType }) => ({
              key,
              name,
              type: dataType as 'CHARACTER' | 'DATETIME' | 'FLOAT' | 'INTEGER',
            })) ?? []}
            existingOutputs={editFunction?.outputs.map(({ key, name }) => ({ key, name })) ?? []}
          />
        </Modal>
      )}

      {hasCandidates && (
        <Modal
          isOpen={isCandidateModalOpen}
          title="Credentials required"
          description="Re-enter your credentials to update the requested map(s)."
          onClose={() => handleCancel()}
          onSubmit={handleCandidateSubmit}
          submitLabel="Save"
        >
          <EditMapCandidateForm
            ref={editCandidateFormRef}
            candidates={mapCandidates}
          />
        </Modal>
      )}

      {isLoading ? (
        <div className="flex justify-center items-center pt-6 m-6">
          <AjaxLoader message="Loading maps..." />
        </div>
      ) : !maps.length ? (
        <Dialog
          error={{
            header: "No Maps Found",
            message: "No maps found for this integration.",
            errorType: "warning",
            onClose: onBack ?? (() => {}),
          }}
        />
      ) : (
        <div className={`${wizard ? 'boomi-update-wizard': 'boomi-update'}`}>
          {showTitle && (
            <div className="boomi-update-title">
              {boomiConfig?.components?.[componentKey]?.updateMaps?.title || 'Map Fields'}
            </div>
          )}
          {showDescription && (
            <div className="boomi-update-desc">
              {boomiConfig?.components?.[componentKey]?.updateMaps?.description || 'Please map fields below.'}
            </div>
          )}
          <div className="boomi-tabs">
            <nav className="boomi-tablist">
              {maps.map((map, index) => {
                const active = activeMapIndex === index;
                return (
                  <button
                    key={map.mapId}
                    onClick={() => setActiveMapIndex(index)}
                    className={classNames('boomi-tab', active && 'boomi-tab--active')}
                    type="button"
                  >
                    {map.name || `Map ${index + 1}`}
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="boomi-update-content">
            {apiError && (
              <Dialog
                error={{
                  header: "Error Updating Maps",
                  message: apiError,
                  errorType: "error",
                  onClose: () => setApiError(null),
                }}
              />
            )}
            {useTreeMap ? (
              <FieldMappingCanvasTree
                sourceFields={sourceFields}
                targetFields={targetFields}
                functions={functionsByMapId[currentMapId] || []}
                mappings={mappingsByMapId[currentMapId] || []}
                onMappingChange={handleCanvasMappingChange}
                onTransformationUpdate={handleCanvasFunctionChange}
                onDeleteTransformation={handleCanvasFunctionDelete}
                onEditTransformation={(fn) => {
                  setEditFunction(fn);
                  setEditName(stripYFromId(fn.name));
                  setIsEditing(true);
                }}
                onAddTransformation={() => {
                  setEditFunction(null);
                  setEditName(`script_${Date.now()}`);
                  setIsEditing(true);
                }}
              />
            ) : (
              <FieldMappingCanvas
                sourceFields={sourceFields}
                targetFields={targetFields}
                functions={functionsByMapId[currentMapId] || []}
                mappings={mappingsByMapId[currentMapId] || []}
                onMappingChange={handleCanvasMappingChange}
                onTransformationUpdate={handleCanvasFunctionChange}
                onDeleteTransformation={handleCanvasFunctionDelete}
                onEditTransformation={(fn) => {
                  setEditFunction(fn);
                  setEditName(stripYFromId(fn.name));
                  setIsEditing(true);
                }}
                onAddTransformation={() => {
                  setEditFunction(null);
                  setEditName(`script_${Date.now()}`);
                  setIsEditing(true);
                }}
              />
            )}

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
    </>
  );
  if (!(active || !wizard)) {
    return null;
  }
  return !wizard ? (
    <Page
      componentKey = {componentKey}
      componentName='updateMaps'
      isRootNavigation={false}
      title={`Update Maps - ${integration.integrationPackOverrideName}`}
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
};

UpdateMaps.displayName = 'UpdateMaps';
export default UpdateMaps;
