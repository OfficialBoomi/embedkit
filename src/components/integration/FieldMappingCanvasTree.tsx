/**
 * @file FieldMappingCanvasTree.tsx
 * @component FieldMappingCanvasTree
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  forwardRef,
} from 'react';
import { AiOutlinePlus, AiOutlineRight, AiOutlineDown } from 'react-icons/ai';
import { motion } from 'framer-motion';
import { stripYFromId, embedYInId, parseYFromId, sanitize } from '../../utils/ui-utils';
import { MapExtensionsMapping, MapExtensionsNode } from '@boomi/embedkit-sdk';
import { PositionedFunction } from '../../types/positioned-function';
import Button from '../ui/Button';
import SwalNotification from '../ui/SwalNotification';
import TranformationActions from './TransformationActions';
import SearchBar from '../ui/SearchBar'; // <-- NEW (adjust path if needed)
import logger from '../../logger.service';

const ROW_HEIGHT = 140;
const FIXED_X = 0;

const normalize = (p?: string) => (p || '').replace(/^\/+|\/+$/g, '');

/** ───────────────────────── Types / Tree helpers ───────────────────────── */
interface FieldMappingCanvasProps {
  sourceFields: MapExtensionsNode[];
  targetFields: MapExtensionsNode[];
  functions: PositionedFunction[];
  mappings?: MapExtensionsMapping[];
  onMappingChange?: (mappings: MapExtensionsMapping[]) => void;
  onTransformationUpdate?: (updatedFunctions: PositionedFunction[]) => void;
  onEditTransformation?: (fn: PositionedFunction) => void;
  onDeleteTransformation?: (fn: PositionedFunction) => void;
  onAddTransformation?: (fn: PositionedFunction) => void;
}

type TreeNode = {
  key: string;
  fullPath: string;
  name: string;
  children: TreeNode[];
  isLeaf: boolean;
  node?: MapExtensionsNode;
};

type InternalTreeNode = TreeNode & { __childMap: Map<string, InternalTreeNode> };

const splitXPath = (xpath: string) =>
  (xpath || '').replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);

function ancestorsOf(path: string): string[] {
  const parts = splitXPath(path);
  const acc: string[] = [];
  for (let i = 1; i <= parts.length; i++) acc.push(parts.slice(0, i).join('/'));
  return acc;
}

function buildTree(nodes: MapExtensionsNode[]): TreeNode[] {
  const rootMap = new Map<string, InternalTreeNode>();

  const ensureNode = (
    parentMap: Map<string, InternalTreeNode>,
    parentNode: InternalTreeNode | null,
    seg: string,
    fullPath: string
  ): InternalTreeNode => {
    let tn = parentMap.get(seg);
    if (!tn) {
      tn = {
        key: seg,
        fullPath,
        name: seg,
        children: [],
        isLeaf: false,
        __childMap: new Map<string, InternalTreeNode>(),
      };
      parentMap.set(seg, tn);
      if (parentNode && !parentNode.children.includes(tn)) parentNode.children.push(tn);
    }
    return tn;
  };

  for (const n of nodes) {
    const parts = splitXPath(n.xpath || n.name || '');
    if (!parts.length) continue;

    let parentMap: Map<string, InternalTreeNode> = rootMap;
    let parentNode: InternalTreeNode | null = null;
    let prefix = '';

    for (const seg of parts) {
      prefix = prefix ? `${prefix}/${seg}` : seg;
      const tn = ensureNode(parentMap, parentNode, seg, prefix);
      parentNode = tn;
      parentMap = tn.__childMap;
    }

    if (parentNode) parentNode.node = n;
  }

  const roots: InternalTreeNode[] = Array.from(rootMap.values());

  const markLeaves = (n: InternalTreeNode) => {
    n.isLeaf = n.children.length === 0;
    n.children.forEach((c) => markLeaves(c as InternalTreeNode));
  };
  roots.forEach(markLeaves);

  return roots; // Internal extras are fine
}

function indexTree(nodes: TreeNode[]): Map<string, TreeNode> {
  const map = new Map<string, TreeNode>();
  const visit = (n: TreeNode) => { map.set(n.fullPath, n); n.children.forEach(visit); };
  nodes.forEach(visit);
  return map;
}

function findClosestVisibleAnchor(path: string, refMap: Map<string, HTMLDivElement>): string | null {
  let p = normalize(path);
  while (p) {
    const key = sanitize(p);
    if (refMap.has(key)) return p;
    const idx = p.lastIndexOf('/');
    if (idx < 0) break;
    p = p.slice(0, idx);
  }
  return null;
}

const isUnder = (child?: string, ancestor?: string) =>
  !!child && !!ancestor && (normalize(child) === normalize(ancestor) || normalize(child).startsWith(normalize(ancestor) + '/'));
const eq = (a?: string, b?: string) => normalize(a) === normalize(b);

/** ───────────────────────── Component ───────────────────────── */
const FieldMappingCanvasTree = forwardRef((
  {
    sourceFields,
    targetFields,
    functions,
    mappings = [],
    onMappingChange,
    onTransformationUpdate,
    onEditTransformation,
    onDeleteTransformation,
    onAddTransformation,
  }: FieldMappingCanvasProps,
  _ref
) => {
  // selection
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [selectedOutput, setSelectedOutput] = useState<{ fnId: string; outputKey: number } | null>(null);

  // refs
  const svgRef = useRef<SVGSVGElement>(null);
  const sourceRefs = useRef(new Map<string, HTMLDivElement>());
  const targetRefs = useRef(new Map<string, HTMLDivElement>());
  const funcInputRefs = useRef(new Map<string, HTMLDivElement>());
  const funcOutputRefs = useRef(new Map<string, HTMLDivElement>());
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const functionsAreaRef = useRef<HTMLDivElement>(null);

  // notifications
  const [showNotification, setShowNotification] = useState(false);
  const [showDeleteNotification, setShowDeleteNotification] = useState(false);
  const [pendingDeleteSource, setPendingDeleteSource] = useState<string | null>(null);
  const [pendingDeleteTransformation, setPendingDeleteTransformation] = useState<PositionedFunction | null>(null);

  // tree state
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(new Set());
  const [collapsedTargets, setCollapsedTargets] = useState<Set<string>>(new Set());

  // positions
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  // trees & indices
  const sourceTree = useMemo(() => buildTree(sourceFields), [sourceFields]);
  const targetTree = useMemo(() => buildTree(targetFields), [targetFields]);
  const sourceIndex = useMemo(() => indexTree(sourceTree), [sourceTree]);
  const targetIndex = useMemo(() => indexTree(targetTree), [targetTree]);
  const getIndex = (side: 'source' | 'target') => (side === 'source' ? sourceIndex : targetIndex);
  const getCollapsed = (side: 'source' | 'target') => (side === 'source' ? collapsedSources : collapsedTargets);
  const applyCollapsed = (side: 'source' | 'target', next: Set<string>) => {
    if (side === 'source') setCollapsedSources(next); else setCollapsedTargets(next);
  };
  const expandPath = (side: 'source' | 'target', path: string) => {
    const next = new Set(getCollapsed(side));
    ancestorsOf(normalize(path)).forEach(p => next.delete(p));
    applyCollapsed(side, next);
  };
  const collapseAll = (side: 'source' | 'target') => {
    const next = new Set<string>();
    getIndex(side).forEach(n => { if (!n.isLeaf) next.add(n.fullPath); });
    applyCollapsed(side, next);
  };
  const expandAll = (side: 'source' | 'target') => applyCollapsed(side, new Set());

  // search state (per side)
  const [sourceQuery, setSourceQuery] = useState('');
  const [targetQuery, setTargetQuery] = useState('');
  const [sourceHits, setSourceHits] = useState<string[]>([]);
  const [targetHits, setTargetHits] = useState<string[]>([]);
  const [sourceHitIdx, setSourceHitIdx] = useState(0);
  const [targetHitIdx, setTargetHitIdx] = useState(0);
  const sourceHitSet = useMemo(() => new Set(sourceHits), [sourceHits]);
  const targetHitSet = useMemo(() => new Set(targetHits), [targetHits]);

  const clearSelection = () => {
    setSelectedSource(null);
    setSelectedTarget(null);
    setSelectedFunction(null);
    setSelectedOutput(null);
  };

  const setCardRef = (el: HTMLDivElement | null, id: string) => { if (el) cardRefs.current[id] = el; };
  const setRef = (map: Map<string, HTMLDivElement>, key: string) => (el: HTMLDivElement | null) => {
    if (el) map.set(key, el); else map.delete(key);
  };

  const addMapping = (fromXPath: string, toXPath: string, toFunction?: string, fromFunction?: string) => {
    if (mappings.find(m => m.fromXPath === fromXPath && m.toXPath === toXPath && m.toFunction === toFunction && m.fromFunction === fromFunction)) return;
    onMappingChange?.([...mappings, { fromXPath, toXPath, toFunction, fromFunction }]);
  };

  const removeMapping = (from: string, to: string) => {
    onMappingChange?.(mappings.filter((m) => !(m.fromXPath === from && m.toXPath === to)));
  };

  const removeMappingsFromOutput = (fnId: string, key: number) => {
    onMappingChange?.(mappings.filter((m) => !(m.fromFunction === fnId && m.fromXPath === String(key))));
  };

  const deleteMappingsBySource = (source: string) => {
    onMappingChange?.(mappings.filter(m => m.fromXPath !== source));
  };

  const handleDeleteTransformation = (fn: PositionedFunction) => {
    setPendingDeleteTransformation(fn);
    setShowDeleteNotification(true);
  };

  const handleConfirm = () => {
    if (pendingDeleteSource) {
      deleteMappingsBySource(pendingDeleteSource);
      setPendingDeleteSource(null);
    }
    setShowNotification(false);
  };

  const handleDeleteConfirm = () => {
    if (pendingDeleteTransformation) {
      onDeleteTransformation?.(pendingDeleteTransformation);
      setPendingDeleteTransformation(null);
    }
    setShowDeleteNotification(false);
  };

  const handleCancel = () => {
    setPendingDeleteTransformation(null);
    setPendingDeleteSource(null);
    setShowNotification(false);
  };

  const handleTargetSelect = (rawXPath: string) => {
    const targetAlreadyMapped = mappings.some((m) => m.toXPath === rawXPath);

    if ((selectedSource || selectedOutput) && targetAlreadyMapped) {
      setSelectedTarget(rawXPath);
      setSelectedSource(null);
      setSelectedFunction(null);
      setSelectedOutput(null);
      return;
    }

    if (selectedSource) {
      addMapping(selectedSource, rawXPath, undefined, undefined);
      setSelectedSource(null);
      setSelectedOutput(null);
      setSelectedFunction(null);
      setSelectedTarget(rawXPath);
      return;
    }

    if (selectedOutput) {
      addMapping(String(selectedOutput.outputKey), rawXPath, undefined, selectedOutput.fnId);
      setSelectedOutput(null);
      setSelectedSource(null);
      setSelectedFunction(null);
      setSelectedTarget(rawXPath);
      return;
    }

    setSelectedTarget(rawXPath);
    setSelectedSource(null);
    setSelectedFunction(null);
  };

  useEffect(() => {
    const initial: Record<string, { x: number; y: number }> = {};
    let nextY = 0;
    functions.forEach((fn) => {
      const y = typeof fn.y === 'number' ? fn.y : (parseYFromId(fn.id) ?? nextY);
      initial[fn.id] = { x: fn.x ?? FIXED_X, y };
      if (typeof fn.y !== 'number') nextY += ROW_HEIGHT;
    });
    setPositions(initial);
  }, [functions]);

  /** ───────────────────────── Search logic ───────────────────────── */
  const runSearch = (side: 'source' | 'target', query: string) => {
    const q = normalize(query).toLowerCase();
    if (side === 'source') setSourceQuery(query); else setTargetQuery(query);

    if (!q) {
      if (side === 'source') { setSourceHits([]); setSourceHitIdx(0); }
      else { setTargetHits([]); setTargetHitIdx(0); }
      return;
    }

    const idx = getIndex(side);
    const hits: string[] = [];
    idx.forEach((node) => {
      const nodePath = normalize(node.fullPath).toLowerCase();
      const leafPath = node.isLeaf ? normalize(node.node?.xpath).toLowerCase() : null;

      if (nodePath.includes(q)) {
        hits.push(normalize(node.fullPath)); // group key
      } else if (leafPath && leafPath.includes(q)) {
        hits.push(normalize(node.node!.xpath!)); // leaf key (raw xpath normalized)
      }
    });

    const unique = Array.from(new Set(hits));
    if (side === 'source') {
      setSourceHits(unique);
      setSourceHitIdx(0);
    } else {
      setTargetHits(unique);
      setTargetHitIdx(0);
    }

    if (unique.length > 0) {
      const key = unique[0];
      expandPath(side, key);
      requestAnimationFrame(() => scrollToKey(side, key));
    }
  };

  const scrollToKey = (side: 'source' | 'target', key: string) => {
    const refMap = side === 'source' ? sourceRefs : targetRefs;
    const el = refMap.current.get(sanitize(key));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  };

  const gotoHit = (side: 'source' | 'target', delta: number) => {
    const hits = side === 'source' ? sourceHits : targetHits;
    if (!hits.length) return;
    const idx = side === 'source' ? sourceHitIdx : targetHitIdx;
    const nextIdx = (idx + delta + hits.length) % hits.length;
    if (side === 'source') setSourceHitIdx(nextIdx); else setTargetHitIdx(nextIdx);
    const key = hits[nextIdx];
    expandPath(side, key);
    requestAnimationFrame(() => scrollToKey(side, key));
  };

  /** ───────────────────────── Tree renderer ───────────────────────── */
  const Tree = ({
    side,
    nodes,
    collapsed,
    setCollapsed,
    onLeafClick,
    refMap,
  }: {
    side: 'source' | 'target';
    nodes: TreeNode[];
    collapsed: Set<string>;
    setCollapsed: React.Dispatch<React.SetStateAction<Set<string>>>;
    onLeafClick: (rawXPath: string) => void;
    refMap: React.MutableRefObject<Map<string, HTMLDivElement>>;
  }) => {
    const toggle = (path: string) => {
      setCollapsed(prev => {
        const next = new Set(prev);
        if (next.has(path)) next.delete(path); else next.add(path);
        return next;
      });
    };

    const hitsSet = side === 'source' ? sourceHitSet : targetHitSet;
    const currentKey = side === 'source' ? sourceHits[sourceHitIdx] : targetHits[targetHitIdx];

    const renderNode = (n: TreeNode) => {
      const isCollapsed = collapsed.has(n.fullPath);
      const rawXPath = n.node?.xpath;

      const isMappedLeaf = n.isLeaf
        ? (side === 'source'
            ? mappings.some(m => eq(m.fromXPath, rawXPath))
            : mappings.some(m => eq(m.toXPath, rawXPath)))
        : false;

      const isConnectedToSelection =
        (selectedSource &&
          (side === 'source'
            ? (eq(rawXPath, selectedSource) || isUnder(selectedSource, rawXPath) || isUnder(rawXPath, selectedSource))
            : mappings.some(m => (eq(m.fromXPath, selectedSource) || isUnder(m.fromXPath, selectedSource)) &&
                                  (n.isLeaf ? eq(m.toXPath, rawXPath) : isUnder(m.toXPath, n.fullPath)))))
        ||
        (selectedTarget &&
          (side === 'target'
            ? (eq(rawXPath, selectedTarget) || isUnder(selectedTarget, rawXPath) || isUnder(rawXPath, selectedTarget))
            : mappings.some(m => (eq(m.toXPath, selectedTarget) || isUnder(m.toXPath, selectedTarget)) &&
                                  (n.isLeaf ? eq(m.fromXPath, rawXPath) : isUnder(m.fromXPath, n.fullPath)))))
        ||
        (selectedFunction &&
          mappings.some(m =>
            (m.fromFunction === selectedFunction && side === 'source' && (n.isLeaf ? eq(m.fromXPath, rawXPath) : isUnder(m.fromXPath, n.fullPath)))
            ||
            (m.toFunction === selectedFunction && side === 'target' && (n.isLeaf ? eq(m.toXPath, rawXPath) : isUnder(m.toXPath, n.fullPath)))
          ));

      const shouldPulseTargetLeaf =
        side === 'target' &&
        n.isLeaf &&
        (Boolean(selectedSource) || Boolean(selectedOutput)) &&
        !mappings.some((m) => eq(m.toXPath, rawXPath));

      // key used for refs & hit highlighting
      const refKey = n.isLeaf ? normalize(rawXPath) : normalize(n.fullPath);
      const isSearchHit = hitsSet.has(refKey);
      const isCurrentHit = currentKey && refKey === currentKey;

      return (
        <div key={n.fullPath} className="boomi-tree-node" style={{ marginBottom: 6 }}>
          <div
            className={[
              'boomi-map-card',
              side === 'source' ? 'boomi-map-card--source' : 'boomi-map-card--target',
              n.isLeaf && (side === 'source'
                ? (eq(selectedSource || '', rawXPath || '') ? 'is-selected' : '')
                : (eq(selectedTarget || '', rawXPath || '') ? 'is-selected' : '')),
              isMappedLeaf ? 'is-mapped' : '',
              isConnectedToSelection ? 'is-connected' : '',
              isSearchHit ? 'is-search-hit' : '',
              isCurrentHit ? 'is-current-hit' : '',
              'cursor-pointer'
            ].join(' ')}
            onClick={(e) => {
              e.stopPropagation();
              if (n.isLeaf && rawXPath) {
                if (side === 'source') {
                  setSelectedSource(rawXPath);
                  setSelectedTarget(null);
                  setSelectedFunction(null);
                  setSelectedOutput(null);
                } else {
                  onLeafClick(rawXPath);
                }
              } else {
                toggle(n.fullPath);
                requestAnimationFrame(drawLines);
              }
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1 flex-1 min-w-0">
                {!n.isLeaf && (
                  <button
                    className="boomi-tree-toggle inline-flex items-center justify-center w-4 h-4 p-0 leading-none shrink-0"
                    onClick={(e) => { e.stopPropagation(); toggle(n.fullPath); requestAnimationFrame(drawLines); }}
                    aria-expanded={!isCollapsed}
                    aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                    title={isCollapsed ? 'Expand' : 'Collapse'}
                  >
                    {isCollapsed ? <AiOutlineRight size={12} /> : <AiOutlineDown size={12} />}
                  </button>
                )}
                <div
                  className="boomi-map-card-title text-xs font-medium leading-snug whitespace-normal break-words"
                  style={{ overflowWrap: 'anywhere' }}                       
                >
                  {n.isLeaf ? (n.node?.name ?? n.name) : n.name}
                </div>
              </div>

              {/* Pin ref for drawing lines (closest visible anchor) */}
              <div
                ref={setRef(refMap.current, sanitize(refKey))}
                className={[
                  'boomi-map-pin',
                  side === 'source' ? '--source' : '--target',
                  'is-selectable',
                  shouldPulseTargetLeaf ? 'is-mappable' : '',
                ].join(' ')}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!n.isLeaf || !rawXPath) return;

                  if (side === 'target') {
                    onLeafClick(rawXPath);
                    return;
                  }

                  if (mappings.some((m) => eq(m.fromXPath, rawXPath))) {
                    setPendingDeleteSource(rawXPath);
                    setShowNotification(true);
                  } else {
                    setSelectedSource(rawXPath);
                    setSelectedTarget(null);
                    setSelectedFunction(null);
                    setSelectedOutput(null);
                  }
                }}
              >
                {/* BADGES */}
                {n.isLeaf && isMappedLeaf && side === 'source' && (
                  <span
                    className="boomi-map-pin-badge"
                    onClick={(e) => { e.stopPropagation(); setPendingDeleteSource(rawXPath!); setShowNotification(true); }}
                    title="Disconnect"
                  >
                    ×
                  </span>
                )}
                {n.isLeaf && isMappedLeaf && side === 'target' && (
                  <span
                    className="boomi-map-pin-badge"
                    onClick={(e) => {
                      e.stopPropagation();
                      const mapping = mappings.find((m) => eq(m.toXPath, rawXPath));
                      if (mapping) removeMapping(mapping.fromXPath ?? '', mapping.toXPath ?? '');
                    }}
                    title="Disconnect"
                  >
                    ×
                  </span>
                )}
              </div>
            </div>
          </div>

          {!n.isLeaf && !isCollapsed && n.children.length > 0 && (
            <div className="py-2 boomi-tree-children pl-3 border-l border-dashed border-gray-300">
              {n.children.map(renderNode)}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="boomi-tree" style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {nodes.map(renderNode)}
      </div>
    );
  };

  /** ───────────────────────── Lines ───────────────────────── */
  const drawLines = () => {
    const svg = svgRef.current;
    if (!svg) return;

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    let anyConnected = false;

    mappings.forEach((m) => {
      const rawFrom = m.fromXPath;
      const rawTo = m.toXPath;
      if (!rawFrom) return;

      const startEl = m.fromFunction
        ? funcOutputRefs.current.get(`${m.fromFunction}.out.${sanitize(String(rawFrom))}`) ?? null
        : (() => {
            const anchorFrom = findClosestVisibleAnchor(String(rawFrom), sourceRefs.current);
            return anchorFrom ? (sourceRefs.current.get(sanitize(anchorFrom)) ?? null) : null;
          })();

      const endEl = m.toFunction
        ? funcInputRefs.current.get(`${m.toFunction}.in.${sanitize(String(rawTo))}`) ?? null
        : (() => {
            const anchorTo = findClosestVisibleAnchor(String(rawTo), targetRefs.current);
            return anchorTo ? (targetRefs.current.get(sanitize(anchorTo)) ?? null) : null;
          })();

      if (!startEl || !endEl) return;

      const sRect = startEl.getBoundingClientRect();
      const eRect = endEl.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();

      const start = { x: sRect.left + sRect.width / 2 - svgRect.left, y: sRect.top + sRect.height / 2 - svgRect.top };
      const end   = { x: eRect.left + eRect.width / 2 - svgRect.left, y: eRect.top + eRect.height / 2 - svgRect.top };

      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;
      const offsetX = deltaX / 1.5;
      const maxArcHeight = 12;
      const arcHeight = Math.min(maxArcHeight, Math.abs(deltaY) / 2);
      const arcDirection = deltaY > 0 ? 1 : -1;

      const cp1 = { x: start.x + offsetX, y: start.y - arcDirection * arcHeight };
      const cp2 = { x: end.x - offsetX,  y: end.y - arcDirection * arcHeight };

      const pathString = `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`;

      const matchSource =
        (selectedSource && (eq(m.fromXPath, selectedSource) || isUnder(m.fromXPath, selectedSource))) ||
        (selectedFunction && m.fromFunction === selectedFunction);

      const matchTarget =
        (selectedTarget && (eq(m.toXPath, selectedTarget) || isUnder(m.toXPath, selectedTarget))) ||
        (selectedFunction && m.toFunction === selectedFunction);

      const isConnected = !!(matchSource || matchTarget);

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathString);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-linecap', 'round');

      if (isConnected) {
        path.classList.add('is-highlighted');
        if (selectedSource && (eq(m.fromXPath, selectedSource) || isUnder(m.fromXPath, selectedSource))) {
          path.classList.add('is-danger');
        }
        anyConnected = true;
      }

      svg.appendChild(path);
    });

    if (anyConnected) svg.classList.add('has-selection'); else svg.classList.remove('has-selection');
  };

  useLayoutEffect(() => {
    const redraw = () => requestAnimationFrame(drawLines);
    redraw();
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, [
    mappings,
    functions,
    sourceFields,
    targetFields,
    positions,
    selectedSource,
    selectedTarget,
    selectedFunction,
    collapsedSources,
    collapsedTargets
  ]);

  /** ───────────────────────── Render ───────────────────────── */
  return (
    <>
      {showNotification && (
        <SwalNotification
          type="warning"
          title="Are you sure?"
          description="Disconnecting these mappings cannot be undone."
          showCancel={true}
          confirmButtonText="Yes, Disconnect All!"
          cancelButtonText="No, cancel"
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
      {showDeleteNotification && (
        <SwalNotification
          type="warning"
          title="Are you sure?"
          description="Deleting this transformation cannot be undone and will remove all mappings associated with it."
          showCancel={true}
          confirmButtonText="Yes, Delete!"
          cancelButtonText="No, cancel"
          onConfirm={handleDeleteConfirm}
          onCancel={handleCancel}
        />
      )}

      <div
        className="boomi-map-canvas"
        onClick={(e) => {
          const el = e.target as HTMLElement;
          if (!el.closest('.boomi-map-card') && !el.closest('.boomi-map-pin')) clearSelection();
        }}
      >
        <svg ref={svgRef} className="boomi-map-svg" />

        {/* Sources (tree) */}
        <div className="boomi-map-col boomi-map-col--sources">
          <div className="flex items-center justify-between">
            <h3 className="boomi-map-heading">Sources</h3>
            <div className="flex gap-2">
              <Button
                toggle={false}
                primary={false}
                showIcon={false}
                label="Expand All"
                onClick={() => { expandAll('source'); requestAnimationFrame(drawLines); }}
              />
              <Button
                toggle={false}
                primary={false}
                showIcon={false}
                label="Collapse All"
                onClick={() => { collapseAll('source'); requestAnimationFrame(drawLines); }}
              />
            </div>
          </div>

          {/* Search + nav */}
          <div className="mt-2 flex items-center gap-2">
            <SearchBar searchCallback={(q) => runSearch('source', q)} />
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                className="px-2 py-1 rounded border boomi-btn-xs"
                onClick={() => gotoHit('source', -1)}
                disabled={sourceHits.length === 0}
                title="Previous result"
              >
                Prev
              </button>
              <span className="min-w-[56px] text-center">
                {sourceHits.length ? `${sourceHitIdx + 1} / ${sourceHits.length}` : '0 / 0'}
              </span>
              <button
                type="button"
                className="px-2 py-1 rounded border boomi-btn-xs"
                onClick={() => gotoHit('source', +1)}
                disabled={sourceHits.length === 0}
                title="Next result"
              >
                Next
              </button>
            </div>
          </div>

          <Tree
            side="source"
            nodes={sourceTree}
            collapsed={collapsedSources}
            setCollapsed={setCollapsedSources}
            onLeafClick={(rawXPath) => {
              setSelectedSource(rawXPath);
              setSelectedTarget(null);
              setSelectedFunction(null);
              setSelectedOutput(null);
            }}
            refMap={sourceRefs}
          />
        </div>

        {/* Transformations */}
        <div className="boomi-map-col boomi-map-col--functions">
          <div className="flex justify-between items-center mb-2">
            <h3 className="boomi-map-heading w-full text-center">Transformations</h3>
            <div className="flex-1 text-right">
              <Button
                toggle={false}
                primary={false}
                viewLoc="field-mapping-add-transformation"
                buttonClass="ml-2"
                onClass="boomi-map-add-btn"
                showIcon={true}
                label="Add"
                icon={<AiOutlinePlus className="w-4 h-4" />}
                onClick={() => {
                  const newFn: PositionedFunction = {
                    id: `temp-${Date.now()}`,
                    name: 'New Function',
                    type: 'custom',
                    inputs: [],
                    outputs: [],
                  };
                  onAddTransformation?.(newFn);
                }}
              />
            </div>
          </div>

          <div
            ref={functionsAreaRef}
            className="relative w-full max-w-md h-full"
            style={{ minHeight: 500, paddingTop: 15, paddingBottom: 15 }}
          >
            {functions.map((fn) => {
              logger.debug('Rendering function:', fn);
              const pos = positions[fn.id] || { x: FIXED_X, y: 15 };
              const outMappingsByKey = (key: number) =>
                mappings.filter((m) => m.fromFunction === fn.id && m.fromXPath === String(key));

              return (
                <motion.div
                  key={fn.id}
                  ref={(el) => setCardRef(el, fn.id)}
                  drag="y"
                  dragMomentum={false}
                  dragElastic={0}
                  dragSnapToOrigin={false}
                  dragConstraints={functionsAreaRef}
                  className={`boomi-map-card boomi-map-card--function absolute w-full ${selectedFunction === fn.id ? 'is-selected' : ''}`}
                  style={{ left: pos.x, y: Math.max(15, pos.y), cursor: 'grab' }}
                  onDrag={(_, info) => {
                    setPositions((prev) => ({ ...prev, [fn.id]: { ...prev[fn.id], y: info.delta.y } }));
                  }}
                  onDragEnd={() => {
                    const baseId = stripYFromId(fn.id);
                    const card = cardRefs.current[fn.id];
                    if (card) {
                      const containerTop = card.parentElement?.getBoundingClientRect().top ?? 0;
                      const cardTop = card.getBoundingClientRect().top;
                      const relativeY = Math.round(cardTop - containerTop);
                      const clampedY = Math.max(15, relativeY);
                      const newId = embedYInId(baseId, clampedY);

                      const updatedFunctions = functions.map((f) =>
                        f.id === fn.id && f.id !== newId ? { ...f, newId, x: f.x ?? FIXED_X, y: clampedY } : f
                      );
                      onTransformationUpdate?.(updatedFunctions);
                      requestAnimationFrame(drawLines);
                    }
                  }}
                  onClick={() => {
                    setSelectedFunction(fn.id);
                    setSelectedSource(null);
                    setSelectedTarget(null);
                  }}
                >
                  <div className="flex justify-between items-center py-1">
                    <div className="boomi-map-card-title">Transformation</div>
                    <TranformationActions
                      onEditTransformation={() => onEditTransformation?.(fn)}
                      onDeleteTransformation={() => handleDeleteTransformation(fn)}
                    />
                  </div>
                  <div className="boomi-map-card-subtitle text-xs">{fn.type}</div>

                  <div className="flex justify-between mt-4">
                    {/* Inputs */}
                    <div className="flex flex-col gap-1">
                      {fn.inputs.map((input) => {
                        const inputKey = `${fn.id}.in.${input.key}`;
                        const isMapped = mappings.some((m) => m.toFunction === fn.id && m.toXPath === `${input.key}`);
                        const mapping = mappings.find((m) => m.toFunction === fn.id && m.toXPath === `${input.key}`);

                        return (
                          <div key={input.key} className="relative z-50">
                            <div className="text-xs pl-2 pb-2">{input.name}</div>
                            <div
                              ref={setRef(funcInputRefs.current, inputKey)}
                              className={`boomi-map-pin --input is-selectable ${selectedSource && !isMapped ? 'is-mappable' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (selectedSource && !isMapped) {
                                  addMapping(selectedSource, input.key.toString(), fn.id);
                                  setSelectedSource(null);
                                }
                              }}
                            >
                              {isMapped && mapping && (
                                <div
                                  className="boomi-map-pin-badge"
                                  onClick={(e) => { e.stopPropagation(); removeMapping(mapping.fromXPath ?? '', mapping.toXPath ?? ''); }}
                                  title="Disconnect"
                                >
                                  ×
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Outputs — badge with count + bulk disconnect */}
                    <div className="flex flex-col gap-1 items-end">
                      {fn.outputs.map((output) => {
                        const outputKey = `${fn.id}.out.${output.key}`;
                        const isActiveOutput = selectedOutput?.fnId === fn.id && selectedOutput.outputKey === output.key;
                        const outMappings = outMappingsByKey(output.key);

                        return (
                          <div key={output.key} className="relative">
                            <div className="text-xs pr-2 pb-2">{output.name}</div>
                            <div
                              ref={setRef(funcOutputRefs.current, outputKey)}
                              className={`boomi-map-pin --output is-selectable ${isActiveOutput ? 'is-active-output' : ''}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedOutput({ fnId: fn.id, outputKey: output.key });
                                setSelectedFunction(fn.id);
                                setSelectedSource(null);
                                setSelectedTarget(null);
                              }}
                            >
                              {outMappings.length > 0 && (
                                <div
                                  className="boomi-map-pin-badge"
                                  onClick={(e) => { e.stopPropagation(); removeMappingsFromOutput(fn.id, output.key); }}
                                  title={outMappings.length > 1 ? `Disconnect ${outMappings.length} targets` : 'Disconnect'}
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
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Targets (tree) */}
        <div className="boomi-map-col boomi-map-col--targets">
          <div className="flex items-center justify-between">
            <h3 className="boomi-map-heading">Targets</h3>
            <div className="flex gap-2">
              <Button
                toggle={false}
                primary={false}
                showIcon={false}
                label="Expand All"
                onClick={() => { expandAll('target'); requestAnimationFrame(drawLines); }}
              />
              <Button
                toggle={false}
                primary={false}
                showIcon={false}
                label="Collapse All"
                onClick={() => { collapseAll('target'); requestAnimationFrame(drawLines); }}
              />
            </div>
          </div>

          {/* Search + nav */}
          <div className="mt-2 flex items-center gap-2">
            <SearchBar searchCallback={(q) => runSearch('target', q)} />
            <div className="flex items-center gap-1 text-xs">
              <button
                type="button"
                className="px-2 py-1 rounded border boomi-btn-xs"
                onClick={() => gotoHit('target', -1)}
                disabled={targetHits.length === 0}
                title="Previous result"
              >
                Prev
              </button>
              <span className="min-w-[56px] text-center">
                {targetHits.length ? `${targetHitIdx + 1} / ${targetHits.length}` : '0 / 0'}
              </span>
              <button
                type="button"
                className="px-2 py-1 rounded border boomi-btn-xs"
                onClick={() => gotoHit('target', +1)}
                disabled={targetHits.length === 0}
                title="Next result"
              >
                Next
              </button>
            </div>
          </div>

          <Tree
            side="target"
            nodes={targetTree}
            collapsed={collapsedTargets}
            setCollapsed={setCollapsedTargets}
            onLeafClick={handleTargetSelect}
            refMap={targetRefs}
          />
        </div>
      </div>
    </>
  );
});

export default FieldMappingCanvasTree;
