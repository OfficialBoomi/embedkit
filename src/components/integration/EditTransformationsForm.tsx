import {
  useImperativeHandle,
  forwardRef,
  useState,
  useEffect,
  useRef,
} from 'react';
import AceEditor from "react-ace";
import "ace-builds/src-min-noconflict/mode-javascript";
import "ace-builds/src-min-noconflict/mode-groovy";
import "ace-builds/src-min-noconflict/theme-tomorrow_night_bright";
import "ace-builds/src-min-noconflict/theme-chrome";
import "ace-builds/src-min-noconflict/ext-language_tools";
import "ace-builds/src-min-noconflict/ext-spellcheck";
import "ace-builds/src-min-noconflict/snippets/javascript";
import ace from 'ace-builds/src-noconflict/ace';
ace.config.set("basePath", "https://cdn.jsdelivr.net/npm/ace-builds@1.4.3/src-noconflict/");
ace.config.setModuleUrl('ace/mode/javascript_worker', "https://cdn.jsdelivr.net/npm/ace-builds@1.4.3/src-noconflict/worker-javascript.js");
import { AiOutlineDelete } from "react-icons/ai"
import type { MapExtensionsFunction } from '@boomi/embedkit-sdk';
import { usePlugin } from '../../context/pluginContext';
import { embedYInId } from '../../utils/ui-utils';
import { getSandboxUrl } from '../../utils/sandboxUrl';
import { useFetchAiTransformations } from '../../hooks/ai/useFetchAiTransformations'
import {
  FUNCTION_CATEGORIES,
  FUNCTION_TYPES,
  FUNCTION_TYPE_BY_ID,
  SCRIPT_LANGUAGES,
  buildFunctionDefinition,
  type CacheType,
  type ConfigField,
  type DataType,
  type PinDef,
  type ScriptLanguage,
} from '../../utils/functionTypes';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import Dropdown, { type Option } from '../ui/Dropdown';
import Input from '../ui/Input';
import logger from '../../logger.service';
import { emitEmbedKitEvent } from '../../events.service';

/**
 * Valid data types for transformation inputs.
 */
const DATA_TYPES = ['CHARACTER', 'DATETIME', 'FLOAT', 'INTEGER'] as const;

/** Form name for the Editor's standard fields, so `boomiConfig.form.transformationEditor` overrides apply. */
const FORM_NAME = 'transformationEditor';

/**
 * @typedef EditTransformationsFormResult
 *
 * @description
 * Output of the form when validated and submitted.
 *
 * @property {string} id - Unique identifier of the transformation.
 * @property {string} script - The transformation script content.
 * @property {{name: string, key: number, type: ('CHARACTER'|'DATETIME'|'FLOAT'|'INTEGER')}[]} inputs
 *  List of input parameters for the transformation.
 *  Each input includes a name, numeric key, and a supported data type.
 * @property {{name: string, key: number}[]} outputs
 *  List of output parameters for the transformation.
 *  Each output includes a name and numeric key.
 * @property {('Javascript'|'GROOVY'|'GROOVY2')} [language] - Script language. Javascript unless the Editor chose Groovy.
 * @property {MapExtensionsFunction} [definition] - Set when the Editor built a platform-defined function
 *  instead of a script; `script`, `inputs` and `outputs` are then empty.
 */
export type EditTransformationsFormResult = {
  id: string;
  script: string;
  inputs: {
    name: string;
    key: number;
    type: 'CHARACTER' | 'DATETIME' | 'FLOAT' | 'INTEGER';
  }[];
  outputs: {
    name: string;
    key: number;
  }[];
  language?: ScriptLanguage;
  definition?: MapExtensionsFunction;
};

/**
 * @typedef EditTransformationsFormRef
 *
 * @description
 * Methods exposed via ref to parent components.
 */
export type EditTransformationsFormRef = {
  validateAndSubmit: () => EditTransformationsFormResult | null;
  isFormReady: () => boolean;
};

/**
 * @interface EditTransformationsFormProps
 *
 * @description
 * Props for the `EditTransformationsForm` component.
 *
 * @property {string} [existingName] - Optional existing transformation name to prefill in the form.
 * @property {string} [existingScript] - Optional existing script content to prefill in the form.
 * @property {{ name: string; key: number; type: typeof DATA_TYPES[number] }[]} [existingInputs]
 *  Optional list of existing input parameters to prefill in the form.
 * @property {{ name: string; key: number }[]} [existingOutputs]
 *  Optional list of existing output parameters to prefill in the form.
 * @property {boolean} [showAi=true] - The AI tab: describe a transformation, edit the script (updateMaps.allowAiEditor).
 * @property {boolean} [showEditor=false] - The Editor tab: build any function type (updateMaps.allowFullEditor).
 *  Tabs appear only when both are on. With both off the AI tab is shown, as before these options existed.
 * @property {('Javascript'|'GROOVY'|'GROOVY2')} [existingLanguage] - Language of the script being edited.
 * @property {MapExtensionsFunction} [existingFunction] - A platform-defined function being edited in the Editor.
 *  Its type is fixed and its settings, defaults and pins are loaded from it.
 */
interface EditTransformationsFormProps {
  componentKey: string
  existingName?: string;
  existingScript?: string;
  existingInputs?: { name: string; key: number; type: typeof DATA_TYPES[number] }[];
  existingOutputs?: { name: string; key: number }[];
  showAi?: boolean;
  showEditor?: boolean;
  existingLanguage?: ScriptLanguage;
  existingFunction?: MapExtensionsFunction;
}

const CATEGORY_OPTIONS: Option[] = FUNCTION_CATEGORIES
  .filter((c) => FUNCTION_TYPES.some((f) => f.category === c))
  .map((c) => ({ id: c, name: c }));
const functionOptions = (category: string): Option[] =>
  FUNCTION_TYPES.filter((f) => f.category === category).map((f) => ({ id: f.type, name: f.label }));
const LANGUAGE_OPTIONS: Option[] = SCRIPT_LANGUAGES.map((l) => ({ id: l.value, name: l.label }));
const CACHE_OPTIONS: Option[] = [
  { id: 'None', name: 'None' },
  { id: 'ByDocument', name: 'By Document' },
  { id: 'ByMap', name: 'By Map' },
];
const BOOLEAN_OPTIONS: Option[] = [
  { id: 'false', name: 'No' },
  { id: 'true', name: 'Yes' },
];

/** Settings of a platform-defined function, read back from its Configuration element as strings. */
function configFromFunction(fn: MapExtensionsFunction | undefined, element: string): Record<string, string> {
  const cfg = (fn?.Configuration as Record<string, any> | undefined)?.[element] ?? {};
  return Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, v == null ? '' : String(v)]));
}

const EditTransformationsForm = forwardRef<EditTransformationsFormRef, EditTransformationsFormProps>(({
  componentKey,
  existingName = '',
  existingScript = '',
  existingInputs = [],
  existingOutputs = [],
  showAi = true,
  showEditor = false,
  existingLanguage,
  existingFunction,
}, ref) => {
  const { boomiConfig } = usePlugin();
  const generatedId = `custom_scripting_${Date.now()}`;
  const [id, setId] = useState(() =>
    existingName ? embedYInId(existingName, 0) : generatedId
  );
  const [script, setScript] = useState(existingScript);
  const [inputs, setInputs] = useState(existingInputs ?? []);
  const [outputs, setOutputs] = useState(existingOutputs ?? []);
  const [newInputName, setNewInputName] = useState('');
  const [newInputType, setNewInputType] = useState<typeof DATA_TYPES[number]>('CHARACTER');
  const [newOutputName, setNewOutputName] = useState('');
  const [formErrors, setFormErrors] = useState({
    outputField: '',
    script: '',
  });
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [inputValues, setInputValues] = useState<Record<number, string>>({});
  const [outputResults, setOutputResults] = useState<Record<string, string>>({});
  const [outputError, setOutputError] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const { result: aiResult, isLoading: aiLoading, error: aiError, fetchTransformation } = useFetchAiTransformations();
  const ai = boomiConfig?.enableAi || false;
  const theme = boomiConfig?.theme?.darkModeTheme ? 'tomorrow_night_bright' : 'chrome';

  // Which editors are on. With neither, the AI tab is shown, as before these options existed.
  const aiOn = showAi || !showEditor;
  const editorOn = showEditor;
  const editingBuiltIn = !!existingFunction && FUNCTION_TYPE_BY_ID.has(existingFunction.type ?? '');
  const scriptLanguage = existingLanguage ?? 'Javascript';
  const [mode, setMode] = useState<'ai' | 'editor'>(() => {
    if (editingBuiltIn) return 'editor';
    if (editorOn && scriptLanguage !== 'Javascript') return 'editor';
    return aiOn ? 'ai' : 'editor';
  });
  // A platform-defined function can't become a script from here, so its type and editor are fixed.
  const showTabs = aiOn && editorOn && !editingBuiltIn;

  // The Editor opens on the function being edited, otherwise on Custom Scripting, so a script
  // carries over between the AI and Editor tabs.
  const [typeId, setTypeId] = useState<string>(() =>
    editingBuiltIn ? (existingFunction!.type as string) : 'CustomScripting'
  );
  const def = FUNCTION_TYPE_BY_ID.get(typeId) ?? FUNCTION_TYPES[0];
  const [language, setLanguage] = useState<ScriptLanguage>(scriptLanguage);
  const [config, setConfig] = useState<Record<string, string>>(() =>
    configFromFunction(existingFunction, def.configElement ?? def.type)
  );
  const [cacheType, setCacheType] = useState<CacheType>(
    () => (existingFunction?.cacheType as CacheType | undefined) ?? 'None'
  );
  const [inputDefaults, setInputDefaults] = useState<string[]>(
    () => (existingFunction?.Inputs?.Input ?? []).map((i) => i.default ?? '')
  );

  // A script in the AI tab, or Custom Scripting in the Editor; otherwise a platform-defined function.
  const isScript = mode === 'ai' || !!def.userPins;

  // Pins of a platform-defined function. An existing function keeps its own names and keys, so
  // the mapping lines drawn to it stay connected.
  const fixedInputs: PinDef[] = existingFunction
    ? (existingFunction.Inputs?.Input ?? []).map((p, i) => ({
        name: p.name ?? '', key: p.key ?? i + 1, dataType: def.inputs[i]?.dataType ?? 'CHARACTER',
      }))
    : def.inputs.map((p, i) => ({ ...p, key: p.key ?? i + 1 }));
  const fixedOutputs: PinDef[] = existingFunction
    ? (existingFunction.Outputs?.Output ?? []).map((p, i) => ({
        name: p.name ?? '', key: p.key ?? i + 1, dataType: def.outputs[i]?.dataType ?? 'CHARACTER',
      }))
    : def.outputs.map((p, i) => ({ ...p, key: p.key ?? i + 1 }));

  const shownInputs: { name: string; key: number; type: DataType }[] = isScript
    ? inputs
    : fixedInputs.map((p) => ({ name: p.name, key: p.key as number, type: p.dataType }));
  const shownOutputs: { name: string; key: number }[] = isScript
    ? outputs
    : fixedOutputs.map((p) => ({ name: p.name, key: p.key as number }));

  // JavaScript runs in the sandbox; built-in types run their evaluator; Groovy and
  // platform-only types (counters, properties) have no local test.
  const canTest = isScript ? language === 'Javascript' : !!def.evaluate;

  const validateFields = () => {
    if (!isScript) {
      const errors = { outputField: '', script: '' };
      setFormErrors(errors);
      return errors;
    }
    const hasInvalidOutputName = outputs.some(output => output?.name?.trim().toLowerCase() === 'output');

    const errors = {
      outputField:
        outputs.length === 0
          ? 'At least one output is required'
          : hasInvalidOutputName
            ? "Output name 'output' is not allowed"
            : '',
      script: script.trim() ? '' : 'Script is required',
    };

    setFormErrors(errors);
    return errors;
  };

  useImperativeHandle(ref, () => ({
    validateAndSubmit: () => {
      const errors = validateFields();
      const hasError = Object.values(errors).some(Boolean);
      logger.debug('EditTransformationsForm.validateAndSubmit hasErrors?', errors)
      if (hasError) return null;
      if (!isScript) {
        const definition = buildFunctionDefinition(def, {
          id,
          cacheType,
          config,
          inputDefaults,
          inputs: fixedInputs,
          outputs: fixedOutputs,
        }) as MapExtensionsFunction;
        logger.debug('EditTransformationsForm.validateAndSubmit (function)', definition);
        return { id, script: '', inputs: [], outputs: [], definition };
      }
      logger.debug('EditTransformationsForm.validateAndSubmit', {
        id,
        script,
        inputs,
        outputs,
        language,
      });

      return { id, script, inputs, outputs, language };
    },
    isFormReady: () => {
      const errors = validateFields();
      return !Object.values(errors).some(Boolean);
    },
  }));

  const clearTest = () => {
    setInputValues({});
    setOutputResults({});
    setOutputError(null);
  };

  const selectType = (opt: Option) => {
    const next = FUNCTION_TYPE_BY_ID.get(opt.id);
    if (!next) return;
    setTypeId(next.type);
    setConfig({});
    setInputDefaults([]);
    clearTest();
    setFormErrors({ outputField: '', script: '' });
  };

  const selectCategory = (opt: Option) => {
    const first = FUNCTION_TYPES.find((f) => f.category === opt.id);
    if (first) selectType({ id: first.type, name: first.label });
  };

  const onBlurScript = () => {
    setFormErrors((prev) => ({ ...prev, script: script.trim() ? '' : 'Script is required' }));
  };

  const addInput = () => {
    if (!newInputName.trim()) return;
    const maxKey = inputs.length > 0 ? Math.max(...inputs.map((inp) => inp.key)) : 0;
    const nextKey = maxKey + 1;
    setInputs([
      ...inputs,
      { name: newInputName.trim(), key: nextKey, type: newInputType }
    ]);
    setNewInputName('');
    setNewInputType('CHARACTER');
  };

  const addOutput = () => {
    if (!newOutputName.trim()) return;
    const maxKey = outputs.length > 0 ? Math.max(...outputs.map((out) => out.key)) : 0;
    const nextKey = maxKey + 1;
    setOutputs([
      ...outputs,
      { name: newOutputName.trim(), key: nextKey }
    ]);
    setNewOutputName('');
  };

  const handleRemoveInput = (indexToRemove: number) => {
    setInputs((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleRemoveOutput = (indexToRemove: number) => {
    setOutputs((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleTestBuiltIn = () => {
    if (!def.evaluate) return;
    try {
      // An empty test value falls back to the input's default, as it does on the platform.
      const values = fixedInputs.map((p, idx) => inputValues[p.key as number] || inputDefaults[idx] || '');
      const cfg = Object.fromEntries(def.config.map((f) => [f.key, config[f.key] ?? f.defaultValue]));
      const result = def.evaluate(values, cfg);
      setOutputResults(Object.fromEntries(fixedOutputs.map((o, idx) => [o.name, result[idx] ?? ''])));
      setOutputError(null);
    } catch (err: any) {
      setOutputResults({});
      setOutputError(err?.message ?? 'Test failed');
    }
  };

  const handleTestScript = () => {
    logger.debug('Testing script with inputs:', inputs, 'and values:', inputValues);
    const inputData: Record<string, any> = {};
    inputs.forEach(inp => {
      const raw = inputValues[inp.key];
      let parsed: any = raw;

      switch (inp.type) {
        case 'FLOAT':
          parsed = parseFloat(raw);
          break;
        case 'INTEGER':
          parsed = parseInt(raw, 10);
          break;
        case 'DATETIME':
          parsed = new Date(raw);
          break;
      }
      inputData[inp.name] = parsed;
    });

    iframeRef.current?.contentWindow?.postMessage({
      script,
      inputs: inputData,
    }, '*');
  };

  const handleTest = () => (isScript ? handleTestScript() : handleTestBuiltIn());

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.data?.type === 'RESULT') {
        const result = event.data.result || {};
        if (typeof result === 'object' && result !== null) {
          setOutputResults({ ...result });
          setOutputError(null);
        }
      } else if (event.data?.type === 'ERROR') {
        const message = event.data.error;
        if (message === 'No script provided or script is not a string') {
          return;
        }

        setOutputError(message || 'Unknown error');
        logger.error('Script Error:', message);
      }
    };

    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  const renderScriptEditor = () => (
    <div>
      <label className="block mb-1 font-semibold">Transformation Script</label>
      <div className={`h-[200px] relative border rounded ${formErrors.script ? 'border-red-500' : ''}`}>
        <AceEditor
          // Remount when the language changes so the highlighter follows it.
          key={language}
          className="flex-1 h-full w-full h-[200px]"
          placeholder=""
          mode={language === 'Javascript' ? 'javascript' : 'groovy'}
          theme={theme}
          width="100%"
          height="100%"
          fontSize={12}
          lineHeight={17}
          showPrintMargin={true}
          showGutter={true}
          highlightActiveLine={true}
          value={script}
          onChange={(v) => {
            setScript(v);
            setFormErrors((prev) => ({ ...prev, script: '' }));
          }}
          onBlur={onBlurScript}
          setOptions={{
            showLineNumbers: true,
            tabSize: 1,
          }}
        />
      </div>
      {formErrors.script && <p className="text-xs text-red-600 mt-1">{formErrors.script}</p>}
    </div>
  );

  const renderConfigField = (field: ConfigField) => {
    const value = config[field.key] ?? field.defaultValue;
    const onValue = (v: string) => setConfig({ ...config, [field.key]: v });
    if (field.kind === 'select' || field.kind === 'boolean') {
      const options = field.kind === 'boolean'
        ? BOOLEAN_OPTIONS
        : (field.options ?? []).map((o) => ({ id: o.value, name: o.label }));
      return (
        <Dropdown
          key={`${def.type}-${field.key}`}
          formName={FORM_NAME}
          inputName={field.key}
          label={field.label}
          options={options}
          selected={options.find((o) => o.id === value)}
          onChange={(opt) => onValue(opt.id)}
        />
      );
    }
    return (
      <Input
        key={`${def.type}-${field.key}`}
        formName={FORM_NAME}
        inputName={field.key}
        label={field.label}
        type={field.kind === 'number' ? 'number' : 'text'}
        required={false}
        readOnly={false}
        helperText={field.helperText}
        value={value}
        onChange={(e) => onValue(e.target.value)}
      />
    );
  };

  const typeOptions = functionOptions(def.category);

  const renderEditorTop = () => (
    <>
      <section className="boomi-fn-editor-section">
        <div className="boomi-fn-editor-row">
          <Dropdown
            formName={FORM_NAME}
            inputName="functionCategory"
            label="Category"
            options={CATEGORY_OPTIONS}
            selected={CATEGORY_OPTIONS.find((o) => o.id === def.category)}
            onChange={selectCategory}
            disabled={editingBuiltIn}
          />
          <Dropdown
            formName={FORM_NAME}
            inputName="functionType"
            label="Function"
            options={typeOptions}
            selected={typeOptions.find((o) => o.id === def.type)}
            onChange={selectType}
            disabled={editingBuiltIn}
            searchable
            searchPlaceholder="Search functions..."
          />
        </div>
      </section>

      {def.userPins ? (
        <section className="boomi-fn-editor-section">
          <div className="boomi-fn-editor-fields">
            <Dropdown
              formName={FORM_NAME}
              inputName="scriptLanguage"
              label="Language"
              options={LANGUAGE_OPTIONS}
              selected={LANGUAGE_OPTIONS.find((o) => o.id === language)}
              onChange={(opt) => {
                setLanguage(opt.id as ScriptLanguage);
                clearTest();
              }}
            />
          </div>
          <div className="mt-3">{renderScriptEditor()}</div>
        </section>
      ) : (
        <>
          {def.config.length > 0 && (
            <section className="boomi-fn-editor-section">
              <h4 className="boomi-fn-editor-heading">Settings</h4>
              <div className="boomi-fn-editor-fields">{def.config.map(renderConfigField)}</div>
            </section>
          )}
          <section className="boomi-fn-editor-section">
            <h4 className="boomi-fn-editor-heading">Defaults</h4>
            <p className="boomi-form-helper">
              Optional. A default is used when no value is mapped to the input, or an empty value is.
            </p>
            <div className="boomi-fn-editor-fields">
              {fixedInputs.map((pin, idx) => (
                <Input
                  key={`${def.type}-default-${idx}`}
                  formName={FORM_NAME}
                  inputName={`default${idx + 1}`}
                  label={pin.name}
                  required={false}
                  readOnly={false}
                  value={inputDefaults[idx] ?? ''}
                  onChange={(e) => {
                    const next = [...inputDefaults];
                    next[idx] = e.target.value;
                    setInputDefaults(next);
                  }}
                />
              ))}
              <Dropdown
                formName={FORM_NAME}
                inputName="cacheType"
                label="Caching"
                options={CACHE_OPTIONS}
                selected={CACHE_OPTIONS.find((o) => o.id === cacheType)}
                onChange={(opt) => setCacheType(opt.id as CacheType)}
              />
            </div>
          </section>
        </>
      )}
    </>
  );

  const renderAiTop = () => (
    <>
      {ai && (
        <div className="space-y-2">
          <label className="block font-semibold">Ask AI to generate transformation</label>
          <div className="flex gap-2">
            <textarea
              rows={2}
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Describe your transformation..."
              className="flex-1 border rounded px-2 py-1 resize-y"
            />
            <button
              type="button"
              disabled={aiLoading || !aiPrompt.trim()}
              onClick={async () => {
                const result = await fetchTransformation(aiPrompt, id);
                if (result) {
                  emitEmbedKitEvent(
                    'ai.transformation.generated',
                    { componentKey },
                    { functionId: id, prompt: aiPrompt }
                  );
                  setScript(result.Configuration.Scripting.Script);
                  setLanguage('Javascript');
                  setInputs(result.Configuration.Scripting.Inputs.Input.map(inp => ({
                    name: inp.name,
                    key: Number(inp.index),
                    type: inp.dataType,
                  })));
                  setOutputs(result.Configuration.Scripting.Outputs.Output.map(out => ({
                    name: out.name,
                    key: Number(out.index),
                  })));
                  setFormErrors({ outputField: '', script: '' });
                }
              }}
              className=" boomi-btn-primary px-3 py-1 disabled:opacity-50"
            >
              {aiLoading ? 'Generating...' : 'Generate'}
            </button>
          </div>
          {aiError &&
            <Dialog
              error={{
                header: "Error Generating Transformation",
                message: aiError,
                errorType: "error",
              }}
            />
          }
        </div>
      )}
      {renderScriptEditor()}
    </>
  );

  return (
    <div className="space-y-4 text-sm">
      <input
        type="hidden"
        value={id}
      />
      <iframe
        ref={iframeRef}
        src={getSandboxUrl()}
        sandbox="allow-scripts"
        style={{ display: 'none' }}
      />
      {showTabs && (
        <div className="boomi-fn-editor-tabs">
          <div className="boomi-tabs">
            <div role="tablist" className="boomi-tablist">
              {([['ai', 'AI'], ['editor', 'Editor']] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  className={`boomi-tab ${mode === value ? 'boomi-tab--active' : ''}`}
                  onClick={() => {
                    setMode(value);
                    clearTest();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {mode === 'ai' ? renderAiTop() : renderEditorTop()}

      {/* Shared bottom: the inputs and outputs, with test values, for every kind of transformation. */}
      {canTest && (
        <div className="flex justify-end mt-2">
          <Button
            toggle={false}
            primary={false}
            viewLoc="field-mapping-add-transformation"
            buttonClass="ml-2"
            onClass="flex items-center gap-1 boomi-btn-secondary"
            showIcon={false}
            label={isScript ? 'Test Script' : 'Test'}
            onClick={handleTest}
          />
        </div>
      )}
      <div className="flex gap-6 mt-4 overflow-x-hidden ">
        <div
          className={`w-1/2 border-1 p-2 ${formErrors.outputField ? 'border-red-500 border-2' : ''}`}
        >
          <label className="block mb-1 font-semibold">Inputs</label>
          {isScript && (
            <div className="flex gap-2 items-center mb-2 w-full">
              <input
                type="text"
                value={newInputName}
                onChange={(e) => setNewInputName(e.target.value)}
                className="border px-2 py-1 rounded w-full"
                placeholder="Input name"
              />
              <select
                value={newInputType}
                onChange={(e) => setNewInputType(e.target.value as typeof DATA_TYPES[number])}
                className="border px-2 py-1 rounded"
              >
                {DATA_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={addInput}
                className="px-2 py-1 border boomi-btn-secondary"
              >
                Add
              </button>
            </div>
          )}
          <div className="border rounded max-h-44 overflow-y-auto">
            <div className="flex px-1 py-1.5 boomi-table-header">
              <div className="flex-1">Name</div>
              {canTest && <div className="w-1/2 text-left">Test Input</div>}
              <div className="w-24 text-center">Type</div>
              {isScript && <div className="w-6" />}
            </div>
            <ul className="space-y-1">
              {shownInputs.map((inp, idx) => (
                <li key={`${inp.key}-${idx}`} className="flex items-center text-xs boomi-table-row p-2">
                  <div className="flex-1 truncate">{inp.name}</div>
                  {canTest && (
                    <input
                      type="text"
                      className="border px-2 py-1 rounded w-1/2"
                      value={inputValues[inp.key] ?? ''}
                      onChange={(e) => setInputValues({ ...inputValues, [inp.key]: e.target.value })}
                    />
                  )}
                  <div className="w-24 text-center">
                    <span className="px-2 py-0.5 rounded-full font-medium">
                      {inp.type}
                    </span>
                  </div>
                  {isScript && (
                    <button
                      onClick={() => handleRemoveInput(idx)}
                      className="text-red-400 hover:text-red-600 transition ml-2"
                      title="Remove input"
                    >
                      <AiOutlineDelete size={14} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div
          className={`w-1/2 border-1 p-2 ${formErrors.outputField ? 'border-red-500 border-2' : ''}`}
        >
          <label className="block mb-1 font-semibold">Outputs</label>
          {isScript && (
            <div className="flex gap-2 items-center mb-2">
              <input
                type="text"
                value={newOutputName}
                onChange={(e) => setNewOutputName(e.target.value)}
                className="border px-2 py-1 rounded w-full"
                placeholder="Output name"
              />
              <button
                type="button"
                onClick={addOutput}
                className="px-2 py-1 boomi-btn-secondary"
              >
                Add
              </button>
            </div>
          )}
          <div className="border rounded max-h-44 overflow-y-auto">
            <div className="flex px-1 py-1.5 boomi-table-header">
              <div className="flex-1">Name</div>
              {canTest && <div className="w-1/2 text-left">Test Output</div>}
              {isScript && <div className="w-6" />}
            </div>
            <ul className="space-y-1">
              {shownOutputs.map((out, idx) => {
                return (
                  <li key={`${out.key}-${idx}`} className="flex items-center text-xs boomi-table-row p-2">
                    <div className="flex-1 truncate">{out.name}</div>
                    {canTest && (
                      // A disabled box, not plain text, so output rows match the input rows' height.
                      <input
                        type="text"
                        disabled
                        aria-label={`Test output for ${out.name}`}
                        className="border px-2 py-1 rounded w-1/2 font-mono text-green-700"
                        value={outputResults?.[out.name] ?? ''}
                      />
                    )}
                    {isScript && (
                      <button
                        onClick={() => handleRemoveOutput(idx)}
                        className="text-red-400 hover:text-red-600 transition ml-2"
                        title="Remove output"
                      >
                        <AiOutlineDelete size={14} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
          {outputError && (
            <p className="text-sm text-red-600 mt-2">Test Error: {outputError}</p>
          )}
          {formErrors.outputField && <p className="text-xs text-red-600 mt-1">{formErrors.outputField}</p>}
        </div>
      </div>
      {!canTest && (
        <p className="boomi-form-helper">
          {isScript
            ? 'Groovy scripts run on the platform, so they can’t be tested here.'
            : 'This function runs on the platform during a process, so it can’t be tested here.'}
        </p>
      )}

    </div>
  );
});

EditTransformationsForm.displayName = 'EditTransformationsForm';
export default EditTransformationsForm;
