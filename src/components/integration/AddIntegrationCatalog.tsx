/**
 * @file AddIntegrationCatalog.tsx
 * @component AddIntegrationCatalog
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The Add Integration experience as a searchable catalog. Eligible packs are
 * shown as cards (or table rows) with connector icons; picking one opens the
 * install step, where the environment list is the session's scoped list and,
 * for single-install packs, excludes environments that already hold the pack.
 *
 * Replaces the dropdown-based AddIntegrationForm when
 * `components[componentKey].form.addIntegration.layout` is not `'form'`.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { AiOutlineAppstore, AiOutlineUnorderedList, AiOutlineArrowLeft } from 'react-icons/ai';
import { usePlugin } from '../../context/pluginContext';
import { useFetchEligiblePacksPage } from '../../hooks/account-group/useFetchEligiblePacksPage';
import { useFetchEnvironments } from '../../hooks/environment/useFetchEnvironments';
import SearchBar from '../ui/SearchBar';
import Button from '../ui/Button';
import Dropdown, { Option } from '../ui/Dropdown';
import Input from '../ui/Input';
import AjaxLoader from '../ui/AjaxLoader';
import Pagination from '../ui/Pagination';
import ConnectorStack from './ConnectorStack';
import IntegrationItem from './IntegrationItem';
import ListFilterButton from '../ui/ListFilterButton';
import { uiVersionAtLeast, UI_VERSIONS } from '../../utils/ui-version';
import {
  installableEnvironments,
  preselectEnvironment,
  validateInstall,
  type CatalogPack,
  type CatalogEnvironment,
} from '../../utils/catalog-utils';
import type { AddIntegrationFormResult } from './AddIntegrationForm';
import logger from '../../logger.service';

export interface AddIntegrationCatalogProps {
  componentKey: string;
  renderType: string;
  existingIntegrationNames: string[];
  /** Called with a validated draft; the parent performs the install. */
  onInstall: (result: AddIntegrationFormResult) => Promise<void> | void;
  isInstalling?: boolean;
}

/** Tiles shown on one row; with more connectors the last tile becomes "+N". */
const MAX_TILES = 4;

const AddIntegrationCatalog: React.FC<AddIntegrationCatalogProps> = ({
  componentKey,
  renderType,
  existingIntegrationNames,
  onInstall,
  isInstalling = false,
}) => {
  const { boomiConfig } = usePlugin();
  const cfg = boomiConfig?.components?.[componentKey]?.form?.addIntegration ?? {};
  const envCfg = boomiConfig?.components?.[componentKey]?.environmentSelect ?? {};
  const showEnvironmentSelect: boolean = cfg.showEnvironmentSelect ?? true;
  // Hide the environment dropdown when exactly one environment is available; it is used automatically.
  const hideEnvironmentSelectWhenSingle: boolean = cfg.hideEnvironmentSelectWhenSingle ?? false;
  // Show which environment the install goes into, on the selected card (also when the dropdown is hidden).
  const showTargetEnvironment: boolean = cfg.showTargetEnvironment ?? true;
  const defaultEnvironmentId: string = cfg.defaultEnvironmentId ?? envCfg.environmentId ?? '';
  const allowDuplicateNames: boolean = cfg.allowDuplicateIntegrationNames ?? false;
  const nameEditable: boolean = cfg.integrationPackName?.editable ?? true;
  const nameLabel: string = cfg.integrationPackName?.label ?? 'Integration Name';
  const defaultView: 'grid' | 'table' = (cfg.catalog?.defaultView ?? 'grid') === 'table' ? 'table' : 'grid';
  const showViewToggle: boolean = cfg.catalog?.showViewToggle ?? true;
  const iconSize: number = Number(cfg.catalog?.connectorIconSize ?? 36) || 36;
  // Type line follows the main Integrations cards (integrations.integration.showType) unless the
  // catalog sets its own; both default to off on the 1.7 UI.
  const cardCfg = boomiConfig?.components?.[componentKey]?.integrations?.integration ?? {};
  const catalogUi = uiVersionAtLeast(boomiConfig, componentKey, UI_VERSIONS.CATALOG);
  const showType: boolean = cfg.catalog?.showType ?? cardCfg.showType ?? !catalogUi;
  // Install button on catalog cards (default on). When it is off, clicking the card starts the install.
  // The table view always shows the button.
  const showInstallButton: boolean = cfg.catalog?.installButton?.show ?? true;
  const installLabel: string = cfg.catalog?.installButton?.label ?? 'Install';

  const catalogPageSize: number = Math.min(Math.max(Number(cfg.catalog?.pageSize ?? 12) || 12, 1), 100);
  // Server-paged: search and paging run on the server; connector icons are resolved per page.
  const {
    packs: pagePacks,
    page,
    totalPages,
    total,
    search,
    setSearch,
    goToPage,
    filters,
    setFilters,
    loadFacets,
    facetsKey,
    isLoading: packsLoading,
    error: packsError,
  } = useFetchEligiblePacksPage<CatalogPack>({ renderType, pageSize: catalogPageSize });
  // Environment / connector filter beside the search box; on by default at uiVersion 1.7.0.
  const showFilter: boolean = cfg.catalog?.filter?.show ?? boomiConfig?.components?.[componentKey]?.integrations?.filter?.show ?? catalogUi;
  const filtered = filters.environmentIds.length + filters.connectorTypes.length > 0;
  const { fetchEnvironments, environments, isLoading: envLoading, error: envError } = useFetchEnvironments();

  const [view, setView] = useState<'grid' | 'table'>(defaultView);
  const [selected, setSelected] = useState<CatalogPack | null>(null);
  const [environmentId, setEnvironmentId] = useState('');
  const [integrationName, setIntegrationName] = useState('');
  const [errors, setErrors] = useState<{ environment?: string; name?: string }>({});

  // Environments come from the server already limited to the session scope.
  useEffect(() => {
    const include = envCfg.includeEnvironments ?? 'ALL';
    // Names only: skip the per-environment runtime/ONLINE lookups.
    fetchEnvironments(include, envCfg.environmentId ?? null, { includeStatus: false }).catch((e) => logger.error('catalog: environments failed', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const packs = pagePacks;

  const envOptions: CatalogEnvironment[] = useMemo(
    () => (selected ? installableEnvironments(selected, (environments ?? []) as CatalogEnvironment[]) : []),
    [selected, environments]
  );

  const choosePack = (pack: CatalogPack) => {
    setSelected(pack);
    setIntegrationName(pack.name ?? '');
    setErrors({});
    const opts = installableEnvironments(pack, (environments ?? []) as CatalogEnvironment[]);
    setEnvironmentId(preselectEnvironment(opts, defaultEnvironmentId));
  };

  const back = () => {
    setSelected(null);
    setErrors({});
  };

  const submit = async () => {
    if (!selected) return;
    // Hidden environment select: the configured default is the only choice.
    const effectiveEnv = showEnvironmentSelect ? environmentId : (defaultEnvironmentId || environmentId);
    const v = validateInstall(
      { pack: selected, environmentId: effectiveEnv, integrationName },
      { environmentOptions: envOptions, existingNames: existingIntegrationNames, allowDuplicateNames }
    );
    if (!v.ok) {
      setErrors({ environment: v.errors.environment, name: v.errors.name });
      return;
    }
    await onInstall({
      integrationPackId: selected.id,
      environmentId: effectiveEnv,
      integrationName: selected.installationType === 'SINGLE' ? (selected.name ?? '') : integrationName.trim(),
      isSingle: selected.installationType === 'SINGLE',
    });
  };

  // Always render the row (same height on every card) so icons line up across cards.
  const renderConnectors = (pack: CatalogPack) => (
    <ConnectorStack
      connectors={pack.connectors}
      size={iconSize}
      maxTiles={MAX_TILES}
      className="boomi-catalog-connectors"
      emptyLabel="No connectors"
    />
  );

  /** Same wording as the cards on the main Integrations page. */
  const typeLabel = (pack: CatalogPack) =>
    pack.isAgent ? 'Agent' : pack.installationType === 'SINGLE' ? 'Single Install Integration' : 'Integration';

  const installedChip = (pack: CatalogPack) => {
    const n = pack.installedInstanceCount ?? 0;
    if (!n) return null;
    const envs = pack.installedEnvironmentIds?.length ?? 0;
    return <div className="boomi-catalog-installed">{envs ? `Installed in ${envs} environment${envs === 1 ? '' : 's'}` : `${n} installed`}</div>;
  };

  // ---------- install step ----------
  if (selected) {
    const isSingle = selected.installationType === 'SINGLE';
    const options: Option[] = envOptions.map((e) => ({ id: e.id, name: `${e.name ?? e.id}${e.classification ? ` (${e.classification})` : ''}` }));
    const selectedOpt = options.find((o) => o.id === environmentId);
    const noneLeft = isSingle && envOptions.length === 0 && !envLoading;

    return (
      <div className="boomi-catalog-install">
        <button type="button" className="boomi-catalog-back" onClick={back} disabled={isInstalling}>
          <AiOutlineArrowLeft className="h-4 w-4" /> Back to catalog
        </button>

        <div className="boomi-catalog-card boomi-catalog-card--selected">
          <div className="boomi-catalog-card__header">
            <div className="boomi-catalog-card__headline">
              {showType && <div className="boomi-catalog-card__type">{typeLabel(selected)}</div>}
              <div className="boomi-catalog-card__title">{selected.name}</div>
            </div>
            {renderConnectors(selected)}
          </div>
          {(selected.displayDescription ?? selected.Description) && (
            <p className="boomi-catalog-card__desc">{selected.displayDescription ?? selected.Description}</p>
          )}
          {showTargetEnvironment && !noneLeft && (() => {
            const targetId = showEnvironmentSelect ? environmentId : (defaultEnvironmentId || environmentId);
            const target = (environments ?? []).find((e: CatalogEnvironment) => e.id === targetId) as CatalogEnvironment | undefined;
            return (
              <div className={`boomi-catalog-card__target-env${target ? '' : ' boomi-catalog-card__target-env--pending'}`} aria-live="polite">
                <span className="boomi-catalog-card__target-env-label">{cfg.targetEnvironmentLabel ?? 'Installing into'}</span>
                <span className="boomi-catalog-card__target-env-name">
                  {envLoading ? 'Loading…' : target ? (target.name ?? target.id) : 'Select an environment'}
                </span>
                {target?.classification && <span className="boomi-catalog-card__target-env-class">{target.classification}</span>}
              </div>
            );
          })()}
        </div>

        {showEnvironmentSelect && !(hideEnvironmentSelectWhenSingle && !envLoading && envOptions.length === 1) && (
          envLoading ? (
            <AjaxLoader message="Loading environments..." />
          ) : noneLeft ? (
            <div className="boomi-notice boomi-notice--warning">This integration is already installed in every environment available to you.</div>
          ) : (
            <Dropdown
              formName="addIntegrationCatalog"
              label={envCfg.label ?? 'Environment'}
              inputName="environment"
              options={options}
              selected={selectedOpt}
              placeholder="Please select"
              required
              disabled={isInstalling}
              error={errors.environment}
              onChange={(o) => { setEnvironmentId(o.id); setErrors((p) => ({ ...p, environment: undefined })); }}
            />
          )
        )}
        {envError && <div className="boomi-notice boomi-notice--error">{envError}</div>}

        <Input
          formName="addIntegrationCatalog"
          label={nameLabel}
          inputName="integrationName"
          required={!isSingle}
          readOnly={isSingle || !nameEditable || isInstalling}
          value={integrationName}
          onChange={(e) => { setIntegrationName(e.target.value); setErrors((p) => ({ ...p, name: undefined })); }}
          error={errors.name}
          helperText={isSingle ? 'Single-install integrations keep the publisher’s name.' : undefined}
        />

        <div className="boomi-catalog-actions">
          <Button toggle={false} primary={true} showIcon={false} label={isInstalling ? 'Installing…' : 'Install'} disabled={isInstalling || noneLeft} isLoading={isInstalling} onClick={() => { void submit(); }} />
        </div>
      </div>
    );
  }

  // ---------- catalog step ----------
  return (
    <div className="boomi-catalog">
      <div className="boomi-catalog-toolbar">
        <div className="boomi-catalog-search">
          <SearchBar
            searchCallback={setSearch}
            placeholder={cfg.catalog?.searchPlaceholder ?? 'Search integrations or connectors'}
            suggestions={packs.map((p) => p.name).filter((n): n is string => typeof n === 'string')}
          />
        </div>
        {showFilter && <ListFilterButton value={filters} onChange={setFilters} loadFacets={loadFacets} facetsKey={facetsKey} />}
        {showViewToggle && (
          <div className="boomi-catalog-view">
            <Button toggle={false} primary={view === 'grid'} showIcon={true} iconOnly={true} icon={<AiOutlineAppstore className="h-5 w-5" />} hoverText="Cards" onClick={() => setView('grid')} />
            <Button toggle={false} primary={view === 'table'} showIcon={true} iconOnly={true} icon={<AiOutlineUnorderedList className="h-5 w-5" />} hoverText="Table" onClick={() => setView('table')} />
          </div>
        )}
      </div>

      {packsLoading ? (
        <AjaxLoader message={cfg.integrationPackSelect?.loadingMessage ?? 'Loading integrations...'} />
      ) : packsError ? (
        <div className="boomi-notice boomi-notice--error">{packsError}</div>
      ) : packs.length === 0 ? (
        <p className="boomi-catalog-muted">{search || filtered ? 'No integrations match your search or filters.' : 'No integrations are available to install.'}</p>
      ) : view === 'grid' ? (
        <ul className="boomi-catalog-grid" role="list">
          {packs.map((pack) => (
            // Same markup and classes as the main Integrations cards, so both are the same size.
            <IntegrationItem
              key={pack.id}
              integration={pack as any}
              isAgent={!!pack.isAgent}
              className={`boomi-integration-card--ui-1-7 boomi-catalog-item boomi-catalog-item--${pack.installationType === 'SINGLE' ? 'single' : 'multi'}${pack.installedInstanceCount ? ' boomi-catalog-item--installed' : ''}`}
              onActivate={showInstallButton ? undefined : () => choosePack(pack)}
              activateLabel={`${installLabel} ${pack.name ?? ''}`.trim()}
            >
              {showType && (
                <div className="boomi-integration-card__header">
                  <div className="boomi-integration-card__type">{typeLabel(pack)}</div>
                </div>
              )}
              <div className="boomi-integration-card__body">
                <div className="boomi-integration-card__content boomi-integration-card__content--connectors">
                  <div className="boomi-integration-card__title-row">
                    <h3 className="boomi-integration-card__title" title={pack.name}>{pack.name}</h3>
                  </div>
                  <p className="boomi-integration-card__desc">{pack.displayDescription ?? pack.Description ?? ''}</p>
                  <ConnectorStack
                    connectors={pack.connectors}
                    size={iconSize}
                    maxTiles={MAX_TILES}
                    className="boomi-integration-card__connectors"
                    emptyLabel="No connectors"
                  />
                </div>
              </div>
              <div className="boomi-integration-card__footer boomi-integration-card__footer--stacked">
                {/* Placeholder keeps every card the same height when a pack isn't installed yet. */}
                <div className="boomi-integration-card__env-row">
                  {installedChip(pack) ?? <div className="boomi-catalog-installed boomi-catalog-installed--empty" aria-hidden="true">&nbsp;</div>}
                </div>
                {showInstallButton && (
                  <div className="boomi-integration-card__actions">
                    <div className="boomi-integration-card__edit">
                      <Button toggle={false} primary={true} showIcon={false} buttonClass="boomi-catalog-card__select" label={installLabel} onClick={() => choosePack(pack)} />
                    </div>
                  </div>
                )}
              </div>
            </IntegrationItem>
          ))}
        </ul>
      ) : (
        <table className="boomi-catalog-table">
          <thead className="boomi-table-header">
            <tr>
              <th className="boomi-catalog-table__th">Name</th>
              <th className="boomi-catalog-table__th">Description</th>
              <th className="boomi-catalog-table__th">Type</th>
              <th className="boomi-catalog-table__th">Connectors</th>
              <th className="boomi-catalog-table__th">Installed</th>
              <th className="boomi-catalog-table__th-action"></th>
            </tr>
          </thead>
          <tbody>
            {packs.map((pack) => (
              <tr key={pack.id} className="boomi-table-row boomi-catalog-table__row">
                <td className="boomi-catalog-table__td boomi-catalog-table__td--name">{pack.name}</td>
                <td className="boomi-catalog-table__td">{pack.displayDescription ?? pack.Description ?? ''}</td>
                <td className="boomi-catalog-table__td">{typeLabel(pack)}</td>
                <td className="boomi-catalog-table__td boomi-catalog-table__td--connectors">{renderConnectors(pack)}</td>
                <td className="boomi-catalog-table__td">{pack.installedEnvironmentIds?.length ? `${pack.installedEnvironmentIds.length} env` : (pack.installedInstanceCount ? `${pack.installedInstanceCount}` : '—')}</td>
                <td className="boomi-catalog-table__td boomi-catalog-table__td--action"><Button toggle={false} primary={true} showIcon={false} label={installLabel} onClick={() => choosePack(pack)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!packsError && total > 0 && (
        <div className="boomi-catalog-pager">
          <span className="boomi-catalog-pager__summary">
            {`${(page - 1) * catalogPageSize + 1}–${Math.min(page * catalogPageSize, total)} of ${total}`}
          </span>
          {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={goToPage} />}
        </div>
      )}
    </div>
  );
};

export default AddIntegrationCatalog;
