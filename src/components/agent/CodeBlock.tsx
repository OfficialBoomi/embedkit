/**
 * @file JsonBlock.tsx
 * @component JsonBlock
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * A React component that displays a JSON object in a collapsible block with options. 
 *
 * @return {JSX.Element} The rendered modal dialog.
 */
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { usePlugin } from '../../context/pluginContext';
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

type CodeBlockProps = {
  value: unknown;           
  language?: string;              
  title?: string;
  collapsed?: boolean;
  minHeight?: number;        
  maxHeight?: number;          
};

function toStringValue(v: unknown, langHint?: string): string {
  if (typeof v === 'string') {
    if ((langHint ?? '').toLowerCase().includes('json')) {
      try { return JSON.stringify(JSON.parse(v), null, 2); } catch { /* ignore */ }
    }
    return v;
  }
  try { return JSON.stringify(v, null, 2); } catch { return String(v ?? ''); }
}

function languageToAceMode(lang?: string, fallbackGuess?: 'json'|'text'|'xml'|'yaml'|'markdown'|'sql'|'html'|'css'|'sh'): string {
  const s = (lang ?? '').toLowerCase();
  // direct hits
  const map: Record<string,string> = {
    'javascript':'javascript','typescript':'typescript','json':'json','json5':'json',
    'xml':'xml','yaml':'yaml','yml':'yaml','html':'html','css':'css','scss':'scss','less':'less',
    'jsx':'jsx','tsx':'tsx','markdown':'markdown','md':'markdown','sql':'sql','mysql':'mysql',
    'postgresql':'pgsql','pgsql':'pgsql','pl/sql':'sql','powershell':'powershell','shell':'sh','sh':'sh',
    'python':'python','java':'java','c#':'csharp','csharp':'csharp','c++':'c_cpp','cpp':'c_cpp','go':'golang',
    'ruby':'ruby','php':'php','rust':'rust','scala':'scala','clojure':'clojure','ocaml':'ocaml','lua':'lua',
    'toml':'toml','ini':'ini','proto':'protobuf','protocol buffers':'protobuf','latex':'latex','tex':'latex',
    'svg':'svg','hcl':'hcl','makefile':'makefile'
  };
  if (map[s]) return map[s];

  // heuristics
  if (s.includes('json')) return 'json';
  if (s.includes('sql'))  return 'sql';
  if (s.includes('yaml')) return 'yaml';
  if (s.includes('xml'))  return 'xml';
  if (s.includes('md') || s.includes('markdown')) return 'markdown';

  return fallbackGuess ?? 'text';
}

async function ensureMode(mode: string) {
  try {
    await import(/* @vite-ignore */ `ace-builds/src-min-noconflict/mode-${mode}.js`);
  } catch {/* ignore */}
  try {
    await import(/* @vite-ignore */ `ace-builds/src-min-noconflict/worker-${mode}.js`);
  } catch {/* ignore */}
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  value,
  language,
  title = 'Data',
  collapsed = false,
  minHeight = 200,
  maxHeight = 640,
}) => {
  const { boomiConfig } = usePlugin();
  const [isOpen, setIsOpen] = useState(!collapsed);
  const str = useMemo(() => toStringValue(value, language), [value, language]);
  const lines = useMemo(() => Math.max(3, str.split('\n').length), [str]);
  const height = Math.max(minHeight, Math.min(maxHeight, lines * 18 + 48)); // ~18px line
  const theme = boomiConfig?.theme?.darkModeTheme ? 'tomorrow_night_bright' : 'chrome';

  const guess: 'json'|'text'|'xml'|'yaml'|'markdown'|'sql'|'html'|'css'|'sh' =
    typeof value === 'object' && value !== null
      ? 'json'
      : (languageToAceMode(language) as any);
  const mode = languageToAceMode(language, guess);

  useEffect(() => { void ensureMode(mode); }, [mode]);

  const aRef = useRef<HTMLAnchorElement>(null);
  const onCopy = async () => { await navigator.clipboard.writeText(str); };
  const onDownload = () => {
    const blob = new Blob([str], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    if (aRef.current) {
      aRef.current.href = url;
      aRef.current.download = `${(language ?? mode).toLowerCase() || 'data'}.txt`;
      aRef.current.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--boomi-card-border)] bg-[var(--boomi-card-bg)]">
      <div className="flex items-center justify-between px-2 py-1 border-b border-[var(--boomi-card-border)]">
        <span className="text-xs opacity-80">{title}</span>
        <div className="flex items-center gap-2">
          <button className="text-xs opacity-75 hover:opacity-100" onClick={onCopy}>Copy</button>
          <button className="text-xs opacity-75 hover:opacity-100" onClick={onDownload}>Download</button>
          <a ref={aRef} className="hidden" />
          <button className="text-xs opacity-75 hover:opacity-100" onClick={() => setIsOpen(o => !o)}>
            {isOpen ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isOpen && (
        <div className="relative" style={{ height }}>
          <AceEditor
            mode={mode}
            theme={theme}
            width="100%"
            height="100%"
            value={str}
            showPrintMargin
            showGutter
            highlightActiveLine={false}
            setOptions={{
              tabSize: 2,
              useWorker: true,
              showLineNumbers: true,
              wrap: true,
            }}
            editorProps={{ $blockScrolling: true }}
          />
        </div>
      )}
    </div>
  );
};
