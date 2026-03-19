import {
  useImperativeHandle,
  forwardRef,
  useState,
  useEffect,
  useRef,
} from 'react';
import AceEditor from "react-ace";
import "ace-builds/src-min-noconflict/mode-javascript";
import "ace-builds/src-min-noconflict/theme-tomorrow_night_bright";
import "ace-builds/src-min-noconflict/theme-chrome";
import "ace-builds/src-min-noconflict/ext-language_tools";
import "ace-builds/src-min-noconflict/ext-spellcheck";
import "ace-builds/src-min-noconflict/snippets/javascript";
import ace from 'ace-builds/src-noconflict/ace';
ace.config.set("basePath", "https://cdn.jsdelivr.net/npm/ace-builds@1.4.3/src-noconflict/");
ace.config.setModuleUrl('ace/mode/javascript_worker', "https://cdn.jsdelivr.net/npm/ace-builds@1.4.3/src-noconflict/worker-javascript.js");
import { AiOutlineDelete } from "react-icons/ai"
import { usePlugin } from '../../context/pluginContext';
import { embedYInId } from '../../utils/ui-utils';
import { getSandboxUrl } from '../../utils/sandboxUrl';
import { useFetchAiTransformations } from '../../hooks/ai/useFetchAiTransformations'
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import logger from '../../logger.service';

/**
 * Valid data types for transformation inputs.
 */
const DATA_TYPES = ['CHARACTER', 'DATETIME', 'FLOAT', 'INTEGER'] as const;

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
 */
interface EditTransformationsFormProps {
  componentKey: string
  existingName?: string;
  existingScript?: string;
  existingInputs?: { name: string; key: number; type: typeof DATA_TYPES[number] }[];
  existingOutputs?: { name: string; key: number }[];
}

const EditTransformationsForm = forwardRef<EditTransformationsFormRef, EditTransformationsFormProps>(({
  componentKey,
  existingName = '', 
  existingScript = '', 
  existingInputs = [], 
  existingOutputs = [] 
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

  const validateFields = () => {
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
      logger.debug('EditTransformationsForm.validateAndSubmit', {
        id,
        script,
        inputs,
        outputs,
      });

      return {id, script, inputs, outputs };
    },
    isFormReady: () => {
      const errors = validateFields();
      return !Object.values(errors).some(Boolean);
    },
  }));

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
                  setScript(result.Configuration.Scripting.Script);
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
                onClose: () => {},
              }}
            />
          }
        </div>
      )}
      <div>
        <label className="block mb-1 font-semibold">Transformation Script</label>
        <div className={`h-[200px] relative border rounded ${formErrors.script ? 'border-red-500' : ''}`}>
          <AceEditor
            className="flex-1 h-full w-full h-[200px]"
            placeholder=""
            mode="javascript"
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
        <div className="flex justify-end mt-2">
          <Button
            toggle={false}
            primary={false}
            viewLoc="field-mapping-add-transformation"
            buttonClass="ml-2"
            onClass="flex items-center gap-1 boomi-btn-secondary"
            showIcon={false}
            label="Test Script"
            onClick={handleTestScript}
          />
        </div>
        {formErrors.script && <p className="text-xs text-red-600 mt-1">{formErrors.script}</p>}
      </div>
      <div className="flex gap-6 mt-4 overflow-x-hidden ">
        <div
          className={`w-1/2 border-1 p-2 ${formErrors.outputField ? 'border-red-500 border-2' : ''}`}
        >
          <label className="block mb-1 font-semibold">Inputs</label>
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
          <div className="border rounded max-h-44 overflow-y-auto">
            <div className="flex px-1 py-1.5 boomi-table-header">
              <div className="flex-1">Name</div>
              <div className="w-1/2 text-left">Test Input</div>   
              <div className="w-24 text-center">Type</div>
              <div className="w-6" /> 
            </div>
            <ul className="space-y-1">
              {inputs.map((inp, idx) => (
                <li key={idx} className="flex items-center text-xs boomi-table-row p-2">
                  <div className="flex-1 truncate">{inp.name}</div>
                  <input
                    type="text"
                    className="border px-2 py-1 rounded w-1/2"
                    value={inputValues[inp.key] ?? ''}
                    onChange={(e) => setInputValues({ ...inputValues, [inp.key]: e.target.value })}
                  />
                  <div className="w-24 text-center">
                    <span className="px-2 py-0.5 rounded-full font-medium">
                      {inp.type}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveInput(idx)}
                    className="text-red-400 hover:text-red-600 transition ml-2"
                    title="Remove input"
                  >
                    <AiOutlineDelete size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div
          className={`w-1/2 border-1 p-2 ${formErrors.outputField ? 'border-red-500 border-2' : ''}`}
        >
          <label className="block mb-1 font-semibold">Outputs</label>
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
          <div className="border rounded max-h-44 overflow-y-auto">
            <div className="flex px-1 py-1.5 boomi-table-header">
              <div className="flex-1">Name</div>
              <div className="w-1/2 text-left">Test Output</div>
              <div className="w-6" /> 
            </div>
            <ul className="space-y-1">
              {outputs.map((out, idx) => {
                return (
                  <li key={idx} className="flex items-center text-xs boomi-table-row p-2">
                    <div className="flex-1 truncate">{out.name}</div>
                    <span className="font-mono text-green-700 text-left text-xs w-1/2 text-left">
                      {outputResults?.[out.name] ?? ''}
                    </span>
                    <button
                      onClick={() => handleRemoveOutput(idx)}
                      className="text-red-400 hover:text-red-600 transition ml-2"
                      title="Remove output"
                    >
                      <AiOutlineDelete size={14} />
                    </button>
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

    </div>
  );
});

EditTransformationsForm.displayName = 'EditTransformationsForm';
export default EditTransformationsForm;
