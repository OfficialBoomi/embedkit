/**
 * @file FunctionStack.tsx
 * @component FunctionStack
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * The Transformations column of the mapping canvas: the map's functions stacked
 * from the top in their saved order. Users can reorder them (drag the grip, or the
 * up/down buttons) and collapse each one to a single row; they cannot place them
 * freely. The order is saved by embedding each function's position in its id
 * (`---y:<index>`), the same encoding the free-drag canvas used, so older saved
 * maps load in the order they were arranged.
 *
 * Pin elements are registered in `inputRefs` / `outputRefs` under
 * `<fnId>.in.<key>` / `<fnId>.out.<key>` so the canvas can draw lines to them. A
 * collapsed function registers every input key on its left pin and every output
 * key on its right pin, so its lines still end on the row.
 *
 * The search bar above the stack works like the Sources and Targets searches: Enter
 * highlights every function whose label, name, type or input/output names contain
 * the query, and Prev / Next expand and scroll to each match in turn.
 *
 * @return {JSX.Element} The ordered, collapsible list of transformation functions.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import {
  AiOutlineArrowDown,
  AiOutlineArrowUp,
  AiOutlineDown,
  AiOutlineHolder,
  AiOutlinePlus,
  AiOutlineRight,
} from 'react-icons/ai';
import { MapExtensionsMapping } from '@boomi/embedkit-sdk';
import { PositionedFunction } from '../../types/positioned-function';
import { embedYInId, parseYFromId, stripYFromId } from '../../utils/ui-utils';
import Button from '../ui/Button';
import MapSearchRow from './MapSearchRow';
import TranformationActions from './TransformationActions';

type PinRefs = MutableRefObject<Map<string, HTMLDivElement>>;

export interface FunctionStackProps {
  functions: PositionedFunction[];
  mappings: MapExtensionsMapping[];
  selectedFunction: string | null;
  selectedSource: string | null;
  selectedOutput: { fnId: string; outputKey: number } | null;
  inputRefs: PinRefs;
  outputRefs: PinRefs;
  onSelectFunction: (fnId: string) => void;
  onSelectOutput: (fnId: string, outputKey: number) => void;
  onConnectInput: (fnId: string, inputKey: number) => void;
  onRemoveMapping: (fromXPath: string, toXPath: string) => void;
  /** When set, an output pin shows a badge that disconnects all of its targets. */
  onRemoveOutputMappings?: (fnId: string, outputKey: number) => void;
  onReorder: (functions: PositionedFunction[]) => void;
  onEditTransformation?: (fn: PositionedFunction) => void;
  onDeleteTransformation: (fn: PositionedFunction) => void;
  /** Shows the Add button in the column header. */
  onAddTransformation?: () => void;
  /** Called whenever cards move or change height, so the canvas can redraw its lines. */
  onLayoutChange: () => void;
}

/** "CurrentDate" -> "Current Date", "userdefined" -> "User Defined". */
const functionLabel = (fn: PositionedFunction): string => {
  const type = String(fn.raw?.type ?? fn.type ?? '');
  if (/^userdefined$/i.test(type)) return 'User Defined';
  if (/scripting/i.test(type)) return 'Script';
  return type.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim() || 'Transformation';
};

/** Everything a function search matches against, lowercased. */
const searchText = (fn: PositionedFunction): string =>
  [
    functionLabel(fn),
    fn.name,
    fn.type,
    fn.raw?.type,
    ...fn.inputs.map((i) => i.name),
    ...fn.outputs.map((o) => o.name),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

/** Saved order: by the position embedded in the id, then by list order. */
const sortByPosition = (functions: PositionedFunction[]): PositionedFunction[] =>
  functions
    .map((fn, index) => ({ fn, index, y: fn.y ?? parseYFromId(fn.id) }))
    .sort((a, b) => (a.y ?? Infinity) - (b.y ?? Infinity) || a.index - b.index)
    .map(({ fn }) => fn);

/** Ref callback that registers one element under several pin keys. */
const pinRef = (refs: PinRefs, keys: string[]) => (el: HTMLDivElement | null) => {
  keys.forEach((k) => (el ? refs.current.set(k, el) : refs.current.delete(k)));
};

const FunctionStack: React.FC<FunctionStackProps> = (props) => {
  const { functions, onReorder, onLayoutChange, onAddTransformation } = props;
  const sorted = useMemo(() => sortByPosition(functions), [functions]);
  const byId = useMemo(() => new Map(functions.map((f) => [f.id, f])), [functions]);
  const [order, setOrder] = useState<string[]>(() => sorted.map((f) => f.id));
  // Functions start collapsed; this holds the expanded ones, keyed by the id without its
  // position so a function stays expanded after a reorder re-keys it.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const isCollapsed = (id: string) => !expanded.has(stripYFromId(id));

  useEffect(() => { setOrder(sorted.map((f) => f.id)); }, [sorted]);
  useLayoutEffect(() => { onLayoutChange(); }, [order, expanded]);

  // Search: hits are ids without their position, in stack order, so a reorder keeps them.
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [hitIdx, setHitIdx] = useState(0);
  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as string[];
    return order
      .filter((id) => {
        const fn = byId.get(id);
        return fn ? searchText(fn).includes(q) : false;
      })
      .map(stripYFromId);
  }, [query, order, byId]);
  const hitSet = useMemo(() => new Set(hits), [hits]);
  const currentHit = hits.length ? hits[Math.min(hitIdx, hits.length - 1)] : null;

  const showHit = (base: string) => {
    setExpanded((prev) => (prev.has(base) ? prev : new Set(prev).add(base)));
    requestAnimationFrame(() => {
      const el = listRef.current?.querySelector(`[data-fn-key="${CSS.escape(base)}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    });
  };

  const runSearch = (value: string) => {
    setQuery(value);
    setHitIdx(0);
    const q = value.trim().toLowerCase();
    const first = q ? order.find((id) => { const fn = byId.get(id); return fn && searchText(fn).includes(q); }) : undefined;
    if (first) showHit(stripYFromId(first));
  };

  const gotoHit = (delta: number) => {
    if (!hits.length) return;
    const next = (Math.min(hitIdx, hits.length - 1) + delta + hits.length) % hits.length;
    setHitIdx(next);
    showHit(hits[next]);
  };

  const commit = (ids: string[]) => {
    if (ids.join('|') === sorted.map((f) => f.id).join('|')) return;
    onReorder(
      ids.map((id, index) => {
        const fn = byId.get(id)!;
        const newId = embedYInId(stripYFromId(fn.id), index);
        return newId === fn.id ? fn : { ...fn, newId, y: index };
      })
    );
  };

  const move = (id: string, delta: number) => {
    const from = order.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(to, 0, ...next.splice(from, 1));
    setOrder(next);
    commit(next);
  };

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      const base = stripYFromId(id);
      if (next.has(base)) next.delete(base); else next.add(base);
      return next;
    });


  return (
    <div className="boomi-map-fn-stack">
      <div className="boomi-map-fn-stack-header">
        <h3 className="boomi-map-heading">Transformations</h3>
        <div className="boomi-map-fn-stack-tools">
          {order.length > 0 && (
            <>
              <Button
                toggle={false}
                primary={false}
                showIcon={false}
                label="Expand All"
                onClick={() => setExpanded(new Set(order.map(stripYFromId)))}
              />
              <Button
                toggle={false}
                primary={false}
                showIcon={false}
                label="Collapse All"
                onClick={() => setExpanded(new Set())}
              />
            </>
          )}
          {onAddTransformation && (
            <Button
              toggle={false}
              primary={false}
              viewLoc="field-mapping-add-transformation"
              onClass="boomi-map-add-btn"
              showIcon={true}
              label="Add"
              icon={<AiOutlinePlus className="w-4 h-4" />}
              onClick={onAddTransformation}
            />
          )}
        </div>
      </div>

      {/* Search + nav */}
      <MapSearchRow
        onSearch={runSearch}
        hitCount={hits.length}
        hitIndex={Math.min(hitIdx, hits.length - 1)}
        onStep={gotoHit}
      />

      <Reorder.Group ref={listRef} as="div" axis="y" values={order} onReorder={setOrder} className="boomi-map-fn-list">
        {order.map((id, index) => {
          const fn = byId.get(id);
          if (!fn) return null;
          return (
            <FunctionCard
              key={id}
              {...props}
              fn={fn}
              index={index}
              count={order.length}
              isCollapsed={isCollapsed(id)}
              isSearchHit={hitSet.has(stripYFromId(id))}
              isCurrentHit={currentHit === stripYFromId(id)}
              onToggle={() => toggle(id)}
              onMove={(delta) => move(id, delta)}
              onDragEnd={() => commit(order)}
            />
          );
        })}
      </Reorder.Group>
    </div>
  );
};

interface FunctionCardProps extends FunctionStackProps {
  fn: PositionedFunction;
  index: number;
  count: number;
  isCollapsed: boolean;
  isSearchHit: boolean;
  isCurrentHit: boolean;
  onToggle: () => void;
  onMove: (delta: number) => void;
  onDragEnd: () => void;
}

const FunctionCard: React.FC<FunctionCardProps> = ({
  fn,
  index,
  count,
  isCollapsed,
  isSearchHit,
  isCurrentHit,
  onToggle,
  onMove,
  onDragEnd,
  mappings,
  selectedFunction,
  selectedSource,
  selectedOutput,
  inputRefs,
  outputRefs,
  onSelectFunction,
  onSelectOutput,
  onConnectInput,
  onRemoveMapping,
  onRemoveOutputMappings,
  onEditTransformation,
  onDeleteTransformation,
  onLayoutChange,
}) => {
  const dragControls = useDragControls();
  const inputKeys = fn.inputs.map((i) => `${fn.id}.in.${i.key}`);
  const outputKeys = fn.outputs.map((o) => `${fn.id}.out.${o.key}`);
  const inputMapping = (key: number) =>
    mappings.find((m) => m.toFunction === fn.id && m.toXPath === `${key}`);
  const outputMappings = (key: number) =>
    mappings.filter((m) => m.fromFunction === fn.id && m.fromXPath === String(key));
  const connected = fn.inputs.filter((i) => inputMapping(i.key)).length;

  return (
    <Reorder.Item
      as="div"
      value={fn.id}
      layout="position"
      dragListener={false}
      dragControls={dragControls}
      onDrag={onLayoutChange}
      onDragEnd={onDragEnd}
      onLayoutAnimationComplete={onLayoutChange}
      data-fn-key={stripYFromId(fn.id)}
      className={[
        'boomi-map-card boomi-map-card--function',
        isCollapsed ? 'is-collapsed' : '',
        selectedFunction === fn.id ? 'is-selected' : '',
        isSearchHit ? 'is-search-hit' : '',
        isCurrentHit ? 'is-current-hit' : '',
      ].join(' ')}
      onClick={() => onSelectFunction(fn.id)}
    >
      <div className="boomi-map-fn-header">
        <span
          className="boomi-map-fn-grip"
          title="Drag to reorder"
          onPointerDown={(e) => { e.preventDefault(); dragControls.start(e); }}
        >
          <AiOutlineHolder />
        </span>
        <button
          type="button"
          className="boomi-map-fn-toggle"
          aria-expanded={!isCollapsed}
          title={isCollapsed ? 'Expand' : 'Collapse'}
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
        >
          {isCollapsed ? <AiOutlineRight /> : <AiOutlineDown />}
        </button>
        <div className="boomi-map-fn-name">
          <span className="boomi-map-card-title">{index + 1}. {functionLabel(fn)}</span>
          {isCollapsed && (
            <span className="boomi-map-card-subtitle">
              {connected}/{fn.inputs.length} in · {fn.outputs.length} out
            </span>
          )}
        </div>
        <div className="boomi-map-fn-order">
          <button
            type="button"
            title="Move up"
            disabled={index === 0}
            onClick={(e) => { e.stopPropagation(); onMove(-1); }}
          >
            <AiOutlineArrowUp />
          </button>
          <button
            type="button"
            title="Move down"
            disabled={index === count - 1}
            onClick={(e) => { e.stopPropagation(); onMove(1); }}
          >
            <AiOutlineArrowDown />
          </button>
        </div>
        <TranformationActions
          onEditTransformation={fn.editable === false ? undefined : () => onEditTransformation?.(fn)}
          onDeleteTransformation={() => onDeleteTransformation(fn)}
        />
      </div>

      {isCollapsed ? (
        <>
          {inputKeys.length > 0 && (
            <div ref={pinRef(inputRefs, inputKeys)} className="boomi-map-pin --input boomi-map-fn-pin-collapsed" />
          )}
          {outputKeys.length > 0 && (
            <div ref={pinRef(outputRefs, outputKeys)} className="boomi-map-pin --output boomi-map-fn-pin-collapsed" />
          )}
        </>
      ) : (
        <>
          <div className="boomi-map-card-subtitle text-xs">{fn.type}</div>
          <div className="flex justify-between mt-4">
            <div className="flex flex-col gap-1">
              {fn.inputs.map((input) => {
                const mapping = inputMapping(input.key);
                return (
                  <div key={input.key} className="relative z-50">
                    <div className="text-xs pl-2 pb-2">{input.name}</div>
                    <div
                      ref={pinRef(inputRefs, [`${fn.id}.in.${input.key}`])}
                      className={`boomi-map-pin --input is-selectable ${selectedSource && !mapping ? 'is-mappable' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (selectedSource && !mapping) onConnectInput(fn.id, input.key);
                      }}
                    >
                      {mapping && (
                        <div
                          className="boomi-map-pin-badge"
                          title="Disconnect"
                          onClick={(e) => { e.stopPropagation(); onRemoveMapping(mapping.fromXPath ?? '', mapping.toXPath ?? ''); }}
                        >
                          ×
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-col gap-1 items-end">
              {fn.outputs.map((output) => {
                const isActive = selectedOutput?.fnId === fn.id && selectedOutput.outputKey === output.key;
                const outMappings = outputMappings(output.key);
                return (
                  <div key={output.key} className="relative">
                    <div className="text-xs pr-2 pb-2">{output.name}</div>
                    <div
                      ref={pinRef(outputRefs, [`${fn.id}.out.${output.key}`])}
                      className={`boomi-map-pin --output is-selectable ${isActive ? 'is-active-output' : ''}`}
                      onClick={(e) => { e.stopPropagation(); onSelectOutput(fn.id, output.key); }}
                    >
                      {onRemoveOutputMappings && outMappings.length > 0 && (
                        <div
                          className="boomi-map-pin-badge"
                          title={outMappings.length > 1 ? `Disconnect ${outMappings.length} targets` : 'Disconnect'}
                          onClick={(e) => { e.stopPropagation(); onRemoveOutputMappings(fn.id, output.key); }}
                        >
                          ×{outMappings.length > 1 ? ` ${outMappings.length}` : ''}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </Reorder.Item>
  );
};

export default FunctionStack;
