/**
 * @file ListFilterButton.tsx
 * @component ListFilterButton
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Filter icon that opens a panel of environment and connector checkboxes. Used
 * next to the search box on the integrations list and the Add Integration catalog.
 * Options come from the server (`loadFacets`) the first time the panel opens for
 * a given `facetsKey`; the environment section only appears when there are
 * environments to choose from.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AiOutlineFilter } from 'react-icons/ai';
import ConnectorIcon from '../integration/ConnectorIcon';
import type { ListFacets, ListFilters } from '../../service/integrationPacks.service';

interface ListFilterButtonProps {
  value: ListFilters;
  onChange: (next: ListFilters) => void;
  loadFacets: () => Promise<ListFacets>;
  /** Options are reloaded when this changes (e.g. the search text). */
  facetsKey: string;
}

const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

const ListFilterButton: React.FC<ListFilterButtonProps> = ({ value, onChange, loadFacets, facetsKey }) => {
  const [open, setOpen] = useState(false);
  const [facets, setFacets] = useState<ListFacets | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = value.environmentIds.length + value.connectorTypes.length;

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setFacets(await loadFacets());
      setLoadedKey(facetsKey);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [loadFacets, facetsKey]);

  useEffect(() => {
    if (open && loadedKey !== facetsKey && !loading) void load();
  }, [open, loadedKey, facetsKey, loading, load]);

  // Close on a click outside (composedPath works across the shadow root) or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !e.composedPath().includes(rootRef.current)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const envs = facets?.environments ?? [];
  const connectors = facets?.connectors ?? [];

  return (
    <div className="boomi-filter" ref={rootRef}>
      <button
        type="button"
        className={`boomi-filter__button${active ? ' boomi-filter__button--active' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={active ? `Filter (${active} active)` : 'Filter'}
        title="Filter"
        onClick={() => setOpen((o) => !o)}
      >
        <AiOutlineFilter aria-hidden="true" />
        {active > 0 && <span className="boomi-filter__badge">{active}</span>}
      </button>

      {open && (
        <div className="boomi-filter__panel boomi-menu" role="dialog" aria-label="Filter">
          {loading && !facets ? (
            <p className="boomi-filter__note">Loading filters…</p>
          ) : error ? (
            <p className="boomi-filter__note">
              Couldn't load filters.{' '}
              <button type="button" className="boomi-filter__link" onClick={() => void load()}>Try again</button>
            </p>
          ) : envs.length === 0 && connectors.length === 0 ? (
            <p className="boomi-filter__note">Nothing to filter by yet.</p>
          ) : (
            <>
              {envs.length > 0 && (
                <fieldset className="boomi-filter__group">
                  <legend className="boomi-filter__legend">Environment</legend>
                  {envs.map((env) => (
                    <label key={env.id} className="boomi-filter__option">
                      <input
                        type="checkbox"
                        checked={value.environmentIds.includes(env.id)}
                        onChange={() => onChange({ ...value, environmentIds: toggle(value.environmentIds, env.id) })}
                      />
                      <span className="boomi-filter__label">{env.name ?? env.id}</span>
                      {env.classification && <span className="boomi-filter__meta">{env.classification}</span>}
                    </label>
                  ))}
                </fieldset>
              )}
              {connectors.length > 0 && (
                <fieldset className="boomi-filter__group">
                  <legend className="boomi-filter__legend">Connector</legend>
                  {connectors.map((c) => (
                    <label key={c.type} className="boomi-filter__option">
                      <input
                        type="checkbox"
                        checked={value.connectorTypes.includes(c.type)}
                        onChange={() => onChange({ ...value, connectorTypes: toggle(value.connectorTypes, c.type) })}
                      />
                      <ConnectorIcon
                        iconKey={c.iconKey}
                        iconUrl={c.iconUrl}
                        platformIconIsGeneric={c.platformIconIsGeneric}
                        displayName={c.displayName}
                        type={c.type}
                        size={18}
                        className="boomi-filter__icon"
                      />
                      <span className="boomi-filter__label">{c.displayName ?? c.type}</span>
                    </label>
                  ))}
                </fieldset>
              )}
            </>
          )}
          <div className="boomi-filter__foot">
            <button
              type="button"
              className="boomi-filter__link"
              disabled={!active}
              onClick={() => onChange({ environmentIds: [], connectorTypes: [] })}
            >
              Clear filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListFilterButton;
