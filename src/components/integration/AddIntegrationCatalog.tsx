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
import { useFetchAccountGroupIntegrationPacks } from '../../hooks/account-group/useFetchAccountGroupIntegrationPack';
import { useFetchEnvironments } from '../../hooks/environment/useFetchEnvironments';
import SearchBar from '../ui/SearchBar';
import Button from '../ui/Button';
import Dropdown, { Option } from '../ui/Dropdown';
import Input from '../ui/Input';
import AjaxLoader from '../ui/AjaxLoader';
import ConnectorIcon from './ConnectorIcon';
import {
  filterPacks,
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
  const defaultEnvironmentId: string = cfg.defaultEnvironmentId ?? envCfg.environmentId ?? '';
  const allowDuplicateNames: boolean = cfg.allowDuplicateIntegrationNames ?? false;
  const nameEditable: boolean = cfg.integrationPackName?.editable ?? true;
  const nameLabel: string = cfg.integrationPackName?.label ?? 'Integration Name';
  const defaultView: 'grid' | 'table' = (cfg.catalog?.defaultView ?? 'grid') === 'table' ? 'table' : 'grid';
  const showViewToggle: boolean = cfg.catalog?.showViewToggle ?? true;
  const iconSize: number = Number(cfg.catalog?.connectorIconSize ?? 28) || 28;

  const { integrationPacks, isLoading: packsLoading, error: packsError } = useFetchAccountGroupIntegrationPacks({ filter: renderType });
  const { fetchEnvironments, environments, isLoading: envLoading, error: envError } = useFetchEnvironments();

  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'table'>(defaultView);
  const [selected, setSelected] = useState<CatalogPack | null>(null);
  const [environmentId, setEnvironmentId] = useState('');
  const [integrationName, setIntegrationName] = useState('');
  const [errors, setErrors] = useState<{ environment?: string; name?: string }>({});

  // Environments come from the server already limited to the session scope.
  useEffect(() => {
    const include = envCfg.includeEnvironments ?? 'ALL';
    fetchEnvironments(include, envCfg.environmentId ?? null).catch((e) => logger.error('catalog: environments failed', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const packs = useMemo(() => filterPacks((integrationPacks ?? []) as CatalogPack[], search), [integrationPacks, search]);

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

  const renderConnectors = (pack: CatalogPack) => {
    const list = pack.connectors ?? [];
    // Always render the row (same height on every card) so icons line up across cards.
    const rowStyle = { ['--boomi-connector-icon-art' as string]: `${iconSize}px` } as React.CSSProperties;
    if (!list.length) {
      return (
        <div className="boomi-catalog-connectors boomi-catalog-connectors--empty" style={rowStyle}>
          <span className="boomi-catalog-muted">No connectors</span>
        </div>
      );
    }
    const overflow = list.length > MAX_TILES;
    const shown = overflow ? list.slice(0, MAX_TILES - 1) : list;
    const hidden = overflow ? list.slice(MAX_TILES - 1) : [];
    return (
      <div className="boomi-catalog-connectors" aria-label="Connectors" style={rowStyle}>
        {shown.map((c) => (
          <ConnectorIcon
            key={`${c.iconKey}-${c.name}`}
            iconKey={c.iconKey}
            iconUrl={c.iconUrl}
            platformIconIsGeneric={c.platformIconIsGeneric}
            displayName={c.displayName}
            name={c.name}
            type={c.type}
            size={iconSize}
          />
        ))}
        {overflow && (
          <span className="boomi-connector-icon boomi-connector-icon--more" title={hidden.map((c) => c.name).join(', ')}>
            +{hidden.length}
          </span>
        )}
      </div>
    );
  };

  const installedChip = (pack: CatalogPack) => {
    const n = pack.installedInstanceCount ?? 0;
    if (!n) return null;
    const envs = pack.installedEnvironmentIds?.length ?? 0;
    return <span className="boomi-chip boomi-chip--success">{envs ? `Installed in ${envs} environment${envs === 1 ? '' : 's'}` : `${n} installed`}</span>;
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

        <div className="boomi-card boomi-catalog-card boomi-catalog-card--selected">
          <div className="boomi-catalog-card__head">
            <div className="boomi-catalog-card__title">{selected.name}</div>
            <span className="boomi-chip">{isSingle ? 'Single install' : 'Multi install'}</span>
          </div>
          {(selected.displayDescription ?? selected.Description) && (
            <p className="boomi-catalog-card__desc">{selected.displayDescription ?? selected.Description}</p>
          )}
          {renderConnectors(selected)}
        </div>

        {showEnvironmentSelect && (
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
            suggestions={(integrationPacks ?? []).map((p: CatalogPack) => p.name).filter((n: unknown): n is string => typeof n === 'string')}
          />
        </div>
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
        <p className="boomi-catalog-muted">{search ? 'No integrations match your search.' : 'No integrations are available to install.'}</p>
      ) : view === 'grid' ? (
        <ul className="boomi-catalog-grid" role="list">
          {packs.map((pack) => (
            <li key={pack.id} className="boomi-card boomi-catalog-card">
              <div className="boomi-catalog-card__head">
                <div className="boomi-catalog-card__title" title={pack.name}>{pack.name}</div>
                <span className="boomi-chip">{pack.installationType === 'SINGLE' ? 'Single' : 'Multi'}</span>
              </div>
              <p className="boomi-catalog-card__desc">{pack.displayDescription ?? pack.Description ?? ''}</p>
              {renderConnectors(pack)}
              <div className="boomi-catalog-card__foot">
                {installedChip(pack)}
                <Button toggle={false} primary={true} showIcon={false} label="Select" onClick={() => choosePack(pack)} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <table className="w-full table-auto rounded-lg shadow-sm boomi-catalog-table">
          <thead className="boomi-table-header">
            <tr>
              <th className="py-3 px-4 text-left text-sm font-semibold">Name</th>
              <th className="py-3 px-4 text-left text-sm font-semibold">Description</th>
              <th className="py-3 px-4 text-left text-sm font-semibold">Type</th>
              <th className="py-3 px-4 text-left text-sm font-semibold">Connectors</th>
              <th className="py-3 px-4 text-left text-sm font-semibold">Installed</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {packs.map((pack) => (
              <tr key={pack.id} className="boomi-table-row">
                <td className="py-3 px-4 text-sm font-medium">{pack.name}</td>
                <td className="py-3 px-4 text-sm">{pack.displayDescription ?? pack.Description ?? ''}</td>
                <td className="py-3 px-4 text-sm">{pack.installationType === 'SINGLE' ? 'Single' : 'Multi'}</td>
                <td className="py-3 px-4">{renderConnectors(pack)}</td>
                <td className="py-3 px-4 text-sm">{pack.installedEnvironmentIds?.length ? `${pack.installedEnvironmentIds.length} env` : (pack.installedInstanceCount ? `${pack.installedInstanceCount}` : '—')}</td>
                <td className="py-3 px-4 text-right"><Button toggle={false} primary={true} showIcon={false} label="Select" onClick={() => choosePack(pack)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default AddIntegrationCatalog;
