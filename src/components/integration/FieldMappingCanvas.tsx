/**
 * @file FieldMappingCanvas.tsx
 * @component FieldMappingCanvas
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A React component that visually renders and manages field mappings between
 * source fields, transformation functions, and target fields within a Boomi
 * integration mapping UI. Supports interactive creation, editing, deletion,
 * and reordering of mappings and transformations using SVG for visual
 * connection lines.
 *
 * The component displays three columns:
 * - Sources on the left,
 * - Transformations (functions) in the center,
 * - Targets on the right.
 *
 * Users can add, edit, delete, reorder and collapse transformation functions,
 * and create or remove mappings between sources, functions, and targets.
 * Selected elements are highlighted, and destructive actions require user confirmation.
 *
 * The component exposes an imperative method `redrawLines` to allow external redraw triggers.
 *
 * @return {JSX.Element} The interactive mapping canvas with sources, functions, targets, and SVG connections.
 */

import { 
  useLayoutEffect,
  useRef, 
  useState, 
  forwardRef, 
} from 'react';
import { sanitize } from '../../utils/ui-utils';
import FunctionStack from './FunctionStack';
import { 
  MapExtensionsMapping,  
  MapExtensionsNode 
} from '@boomi/embedkit-sdk';
import { 
  PositionedFunction 
} from '../../types/positioned-function';
import SwalNotification from '../ui/SwalNotification';
import logger from '../../logger.service';

/**
 * @interface FieldMappingCanvasProps
 *
 * @description
 * Props for the `FieldMappingCanvas` component.
 *
 * @property {MapExtensionsNode[]} sourceFields - Source fields to display.
 * @property {MapExtensionsNode[]} targetFields - Target fields to display.
 * @property {PositionedFunction[]} functions - Transformation functions with positioning.
 * @property {MapExtensionsMapping[]} [mappings] - Current field/function mappings.
 * @property {(mappings: MapExtensionsMapping[]) => void} [onMappingChange] - Called when mappings change.
 * @property {(updatedFunctions: PositionedFunction[]) => void} [onTransformationUpdate] - Called when transformation functions are updated.
 * @property {(fn: PositionedFunction) => void} [onEditTransformation] - Called to edit a transformation function.
 * @property {(fn: PositionedFunction) => void} [onDeleteTransformation] - Called to delete a transformation function.
 * @property {(fn: PositionedFunction) => void} [onAddTransformation] - Called to add a new transformation function.
 */
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

const FieldMappingCanvas = forwardRef((
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
  ref
) => {
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const sourceRefs = useRef(new Map<string, HTMLDivElement>());
  const targetRefs = useRef(new Map<string, HTMLDivElement>());
  const funcInputRefs = useRef(new Map<string, HTMLDivElement>());
  const funcOutputRefs = useRef(new Map<string, HTMLDivElement>());
  const [showNotification, setShowNotification] = useState(false);
  const [showDeleteNotification, setShowDeleteNotification] = useState(false);
  const [pendingDeleteSource, setPendingDeleteSource] = useState<string | null>(null);
  const [pendingDeleteTransformation, setPendingDeleteTransformation] = useState<PositionedFunction | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [selectedOutput, setSelectedOutput] = useState<{ fnId: string; outputKey: number } | null>(null);

  const clearSelection = () => {
    setSelectedSource(null);
    setSelectedTarget(null);
    setSelectedFunction(null);
    setSelectedOutput(null);
  };

  const setRef = (map: Map<string, HTMLDivElement>, key: string) => (el: HTMLDivElement | null) => {
    if (el) map.set(key, el);
  };

  const addMapping = (
    fromXPath: string,
    toXPath: string,
    toFunction?: string,
    fromFunction?: string
  ) => {
    if (
      mappings.find(
        (m) =>
          m.fromXPath === fromXPath &&
          m.toXPath === toXPath &&
          m.toFunction === toFunction &&
          m.fromFunction === fromFunction
      )
    ) {
      return;
    }

    const newMappings = [
      ...mappings,
      { fromXPath, toXPath, toFunction, fromFunction },
    ];
    onMappingChange?.(newMappings);
  };

  const removeMapping = (from: string, to: string) => {
    const newMappings = mappings.filter((m) => !(m.fromXPath === from && m.toXPath === to));
    onMappingChange?.(newMappings);
  };

  const deleteMappingsBySource = (source: string) => {
    const newMappings = mappings.filter(m => m.fromXPath !== source);
    onMappingChange?.(newMappings);
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
    setShowDeleteNotification(false);
  };

  const handleSourceDelete = (source: string) => {
    setPendingDeleteSource(source);
    setShowNotification(true);
  };

  const drawLines = () => {
    const svg = svgRef.current;
    if (!svg) return;

    while (svg.firstChild) svg.removeChild(svg.firstChild);

    let anyConnected = false;

    mappings.forEach((m) => {
      const rawFrom = m.fromXPath;
      const rawTo = m.toXPath;
      if (!rawFrom) return;

      const startKey = m.fromFunction
        ? `${m.fromFunction}.out.${sanitize(rawFrom)}`
        : sanitize(rawFrom);

      const endKey = m.toFunction
        ? `${m.toFunction}.in.${sanitize(rawTo)}`
        : sanitize(rawTo);

      const startEl = m.fromFunction
        ? funcOutputRefs.current.get(startKey)
        : sourceRefs.current.get(startKey);

      const endEl = m.toFunction
        ? funcInputRefs.current.get(endKey)
        : targetRefs.current.get(endKey);

      if (!startEl || !endEl) return;

      const sRect = startEl.getBoundingClientRect();
      const eRect = endEl.getBoundingClientRect();
      const svgRect = svg.getBoundingClientRect();

      const start = {
        x: sRect.left + sRect.width / 2 - svgRect.left,
        y: sRect.top + sRect.height / 2 - svgRect.top,
      };
      const end = {
        x: eRect.left + eRect.width / 2 - svgRect.left,
        y: eRect.top + eRect.height / 2 - svgRect.top,
      };

      const deltaX = end.x - start.x;
      const deltaY = end.y - start.y;

      const offsetX = deltaX / 1.5;
      const maxArcHeight = 12;
      const arcHeight = Math.min(maxArcHeight, Math.abs(deltaY) / 2);
      const arcDirection = deltaY > 0 ? 1 : -1;

      const cp1 = { x: start.x + offsetX, y: start.y - arcDirection * arcHeight };
      const cp2 = { x: end.x - offsetX,  y: end.y - arcDirection * arcHeight };

      const pathString = `M ${start.x} ${start.y} C ${cp1.x} ${cp1.y} ${cp2.x} ${cp2.y} ${end.x} ${end.y}`;

      const isConnected =
        (selectedSource && m.fromXPath === selectedSource) ||
        (selectedTarget && m.toXPath === selectedTarget) ||
        (selectedFunction && (m.fromFunction === selectedFunction || m.toFunction === selectedFunction));

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', pathString);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('stroke-linecap', 'round');

      if (isConnected) {
        path.classList.add('is-highlighted');
        anyConnected = true;
      }

      svg.appendChild(path);
    });
    if (anyConnected) {
      svg.classList.add('has-selection');
    } else {
      svg.classList.remove('has-selection');
    }
  };

  const handleTargetSelect = (xpath: string) => {
    const targetAlreadyMapped = mappings.some((m) => m.toXPath === xpath);
    if ((selectedSource || selectedOutput) && targetAlreadyMapped) {
      setSelectedTarget(xpath);
      setSelectedSource(null);
      setSelectedFunction(null);
      setSelectedOutput(null);
      return;
    }

    if (selectedSource) {
      addMapping(selectedSource, xpath, undefined, undefined);
      setSelectedSource(null);
      setSelectedOutput(null);
      setSelectedFunction(null);
      setSelectedTarget(xpath);
      return;
    }

    if (selectedOutput) {
      addMapping(
        selectedOutput.outputKey.toString(),
        xpath,
        undefined,
        selectedOutput.fnId
      );
      setSelectedOutput(null);
      setSelectedSource(null);
      setSelectedFunction(null);
      setSelectedTarget(xpath);
      return;
    }
    setSelectedTarget(xpath);
    setSelectedSource(null);
    setSelectedFunction(null);
  };

  useLayoutEffect(() => {
    const redraw = () => {
      requestAnimationFrame(() => {
        drawLines();
      });
    };

    redraw(); 
    window.addEventListener('resize', redraw);

    return () => {
      window.removeEventListener('resize', redraw);
    };
  }, [
    mappings,
    functions,
    sourceFields,
    targetFields,
    selectedSource,
    selectedTarget,
    selectedFunction
  ]);

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
          if (!el.closest('.boomi-map-card') && !el.closest('.boomi-map-pin')) {
            clearSelection();
          }
        }}
      >
        <svg ref={svgRef} className="boomi-map-svg" />
        <div className="boomi-map-col boomi-map-col--sources">
          <h3 className="boomi-map-heading">Sources</h3>
            {sourceFields.map((f, idx) => {
              const reactKey = `${f.xpath}::${idx}`; 
              const isMapped = mappings.some((m) => m.fromXPath === f.xpath);
              return (
                <div
                  key={reactKey}
                  className={`boomi-map-card boomi-map-card--source ${selectedSource === f.xpath ? 'is-selected' : ''} ${isMapped ? 'is-mapped' : ''} cursor-pointer`}
                  onClick={() => {
                    setSelectedSource(f.xpath!);
                    setSelectedTarget(null);
                    setSelectedFunction(null);
                    setSelectedOutput(null);
                  }}
                >
                  <div className="boomi-map-card-title text-xs font-medium truncate">{f.name}</div>
                  <div className="text-[10px] font-thin text-gray-500 break-words whitespace-normal">{f.xpath}</div>
                  <div
                    ref={setRef(sourceRefs.current, sanitize(f.xpath!))}
                    className={`boomi-map-pin --source is-selectable ${selectedSource === f.xpath ? 'is-mappable' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (mappings.some((m) => m.fromXPath === f.xpath)) {
                        handleSourceDelete(f.xpath!);
                      }
                    }}
                  >
                    {mappings.some((m) => m.fromXPath === f.xpath) && (
                      <span className="boomi-map-pin-badge">×</span>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
        <div className="boomi-map-col boomi-map-col--functions">
          <FunctionStack
            functions={functions}
            mappings={mappings}
            selectedFunction={selectedFunction}
            selectedSource={selectedSource}
            selectedOutput={selectedOutput}
            inputRefs={funcInputRefs}
            outputRefs={funcOutputRefs}
            onSelectFunction={(fnId) => {
              setSelectedFunction(fnId);
              setSelectedSource(null);
              setSelectedTarget(null);
            }}
            onSelectOutput={(fnId, outputKey) => {
              setSelectedOutput({ fnId, outputKey });
              setSelectedFunction(fnId);
              setSelectedSource(null);
              setSelectedTarget(null);
            }}
            onConnectInput={(fnId, inputKey) => {
              if (!selectedSource) return;
              addMapping(selectedSource, String(inputKey), fnId);
              setSelectedSource(null);
            }}
            onRemoveMapping={removeMapping}
            onReorder={(updated) => onTransformationUpdate?.(updated)}
            onEditTransformation={onEditTransformation}
            onDeleteTransformation={handleDeleteTransformation}
            onAddTransformation={() =>
              onAddTransformation?.({
                id: `temp-${Date.now()}`,
                name: 'New Function',
                type: 'custom',
                inputs: [],
                outputs: [],
              })
            }
            onLayoutChange={() => requestAnimationFrame(drawLines)}
          />
        </div>
        <div className="boomi-map-col boomi-map-col--targets">
          <h3 className="boomi-map-heading">Targets</h3>
          {targetFields.map((f, idx) => {
            const reactKey = `${f.xpath}::${idx}`;
            const isMapped = mappings.some((m) => m.toXPath === f.xpath);
            const shouldPulseTarget = (Boolean(selectedSource) || Boolean(selectedOutput)) && !isMapped;

            return (
              <div 
                key={reactKey} 
                className={`boomi-map-card boomi-map-card--target ${selectedTarget === f.xpath ? 'is-selected' : ''} ${isMapped ? 'is-mapped' : ''} cursor-pointer`} 
                onClick={() => handleTargetSelect(f.xpath!)}
              >
                <div className="flex justify-start items-center">
                  <div className="flex-0">
                    <span className="text-xs truncate pl-2">{f.name}</span>
                  </div>
                </div>
                <div className="flex justify-start items-center">
                  <div className="flex-0">
                    <div className="text-[10px] font-thin text-gray-500 break-words whitespace-normal">{f.xpath}</div>
                  </div>
                </div>
                <div
                  ref={setRef(targetRefs.current, sanitize(f.xpath!))}
                  className={`boomi-map-pin --target is-selectable ${shouldPulseTarget ? 'is-mappable' : ''}`}
                  onClick={(e) => { e.stopPropagation(); handleTargetSelect(f.xpath!); }}
                >
                  {isMapped && (
                    <span 
                      className="boomi-map-pin-badge" 
                      onClick={(e) => { e.stopPropagation(); const mapping = mappings.find((m) => m.toXPath === f.xpath); if (mapping) removeMapping(mapping.fromXPath ?? '', mapping.toXPath ?? ''); }}
                    >
                      ×
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
});

export default FieldMappingCanvas;