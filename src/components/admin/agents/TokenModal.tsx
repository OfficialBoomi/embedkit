import { useMemo, useState, useEffect } from 'react';
import Modal from '../../ui/Modal';
import Button from '../../ui/Button';
import type { PublicAgentItem } from '../../../service/admin/agents.service';
import { useAgentsService } from '../../../service/admin/agents.service';

type TokenModalProps = {
  isOpen: boolean;
  agentId: string | null;
  tokenId: string | null;
  agents?: PublicAgentItem[];
  primaryAccountId?: string;
  onTokenGenerated?: (tokenId: string) => void;
  onClose: () => void;
};

const TokenModal: React.FC<TokenModalProps> = ({
  isOpen,
  agentId,
  tokenId,
  agents,
  primaryAccountId,
  onTokenGenerated,
  onClose,
}) => {
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);
  const [snippetMode, setSnippetMode] = useState<'single' | 'tiles' | 'list'>('single');
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [selectedSingleAgentId, setSelectedSingleAgentId] = useState<string>('');
  const [isAttaching, setIsAttaching] = useState(false);
  const [attachMessage, setAttachMessage] = useState<string | null>(null);
  const [generatedTokenId, setGeneratedTokenId] = useState<string | null>(null);
  const { createAgent } = useAgentsService();

  const agentOptions = useMemo(() => {
    const list = agents ?? [];
    return list.map((agent) => ({
      id: agent.agentId,
      label: agent.label?.trim() || agent.agentId,
      tokenIds: agent.publicTokenIds ?? [],
    }));
  }, [agents]);

  useEffect(() => {
    if (!isOpen) return;
    const defaultSingle = agentId || agentOptions[0]?.id || '';
    setSelectedSingleAgentId(defaultSingle);
    setSelectedAgentIds(defaultSingle ? [defaultSingle] : []);
    setAttachMessage(null);
    setGeneratedTokenId(null);
    if (agentId) setSnippetMode('single');
  }, [isOpen, agentId, agentOptions]);

  const toggleAgentId = (id: string) => {
    setSelectedAgentIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      return [...prev, id];
    });
  };

  const attachTokenToAgents = async () => {
    const effectiveTokenId = tokenId ?? generatedTokenId;
    if (!primaryAccountId || !effectiveTokenId) return;
    const toAttach = selectedAgentIds.filter((id) => {
      const opt = agentOptions.find((a) => a.id === id);
      return !opt?.tokenIds?.includes(effectiveTokenId);
    });
    if (toAttach.length === 0) {
      setAttachMessage('Token already attached to selected agents.');
      return;
    }
    setIsAttaching(true);
    setAttachMessage(null);
    try {
      await Promise.all(
        toAttach.map((id) =>
          createAgent({
            primaryAccountId,
            agentId: id,
            publicTokenIds: [effectiveTokenId],
          })
        )
      );
      setAttachMessage('Token attached to selected agents.');
    } catch (e: any) {
      setAttachMessage(e?.message || 'Failed to attach token to selected agents.');
    } finally {
      setIsAttaching(false);
    }
  };

  const generateToken = async () => {
    if (!primaryAccountId) return;
    const targetAgentId =
      snippetMode === 'single'
        ? selectedSingleAgentId
        : selectedAgentIds[0];
    if (!targetAgentId) {
      setAttachMessage('Select at least one agent first.');
      return;
    }
    setIsAttaching(true);
    setAttachMessage(null);
    try {
      const resp = await createAgent({
        primaryAccountId,
        agentId: targetAgentId,
        createToken: true,
      });
      const newTokenId = resp.createdToken?.tokenId || null;
      if (!newTokenId) throw new Error('Token generation failed.');
      setGeneratedTokenId(newTokenId);
      onTokenGenerated?.(newTokenId);

      const extraIds =
        snippetMode === 'single'
          ? []
          : selectedAgentIds.filter((id) => id !== targetAgentId);
      if (extraIds.length > 0) {
        await Promise.all(
          extraIds.map((id) =>
            createAgent({
              primaryAccountId,
              agentId: id,
              publicTokenIds: [newTokenId],
            })
          )
        );
      }
      setAttachMessage('Token generated and attached to selected agents.');
    } catch (e: any) {
      setAttachMessage(e?.message || 'Failed to generate token.');
    } finally {
      setIsAttaching(false);
    }
  };

  const snippet = useMemo(() => {
    const effectiveTokenId = tokenId ?? generatedTokenId;
    if (!effectiveTokenId) return '';
    const singleId = selectedSingleAgentId || agentId || '';
    return `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/embedkit-cdn.css" />\n<script>\n  window.BoomiEmbed = {\n    publicToken: "${effectiveTokenId}",\n    agentId: "${singleId || 'project-id'}",\n    mountId: "boomi-agent",\n    serverBase: "https://api.boomi.space/api/v1"\n  };\n</script>\n<script src=\"https://cdn.jsdelivr.net/npm/@boomi/embedkit-cdn/embedkit-cdn.umd.js\" async></script>\n<div id=\"boomi-agent\"></div>`;
  }, [agentId, tokenId, generatedTokenId, snippetMode, selectedAgentIds, selectedSingleAgentId]);

  const copyText = async (text: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      title="Public Token"
      description="Use this token in your embed snippet. Store it securely in your app configuration."
      onClose={onClose}
      onSubmit={onClose}
      showSaveButton
      showCancelButton={false}
      submitLabel="Close"
    >
      <div className="space-y-3">
        <div>
          <label className="boomi-form-label">Token</label>
          <div className="flex gap-2 items-center">
            <input
              className="boomi-input w-full rounded-md p-2 font-mono text-xs"
              readOnly
              value={tokenId ?? generatedTokenId ?? ''}
            />
            <Button
              toggle={false}
              primary={false}
              showIcon={false}
              label={copiedToken ? 'Copied' : 'Copy'}
              onClick={() => {
                const v = tokenId ?? generatedTokenId;
                if (v) copyText(v, setCopiedToken);
              }}
            />
          </div>
          {!tokenId && (
            <div className="mt-2">
              <Button
                toggle={false}
                primary
                showIcon={false}
                label={isAttaching ? 'Generating…' : 'Generate Token'}
                onClick={generateToken}
                disabled={!primaryAccountId || isAttaching}
              />
            </div>
          )}
        </div>
        {!agentId && (
          <div>
            <label className="boomi-form-label">Embed Type</label>
            <select
              className="boomi-input w-full rounded-md p-2 text-sm"
              value={snippetMode}
              onChange={(e) => setSnippetMode(e.target.value as 'single' | 'tiles' | 'list')}
            >
              <option value="single">Single Agent</option>
              <option value="tiles">Multi-Agent (Tiles)</option>
              <option value="list">Multi-Agent (Pill + Modal List)</option>
            </select>
          </div>
        )}
        {snippetMode !== 'single' ? (
          <div>
            <label className="boomi-form-label">Agents</label>
            <div className="boomi-input w-full rounded-md p-2 text-sm space-y-2 max-h-48 overflow-auto">
              {agentOptions.length === 0 ? (
                <div className="text-xs opacity-70">No agents available</div>
              ) : (
                agentOptions.map((agent) => (
                  <label key={agent.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedAgentIds.includes(agent.id)}
                      onChange={() => toggleAgentId(agent.id)}
                    />
                    <span className="text-xs">{agent.label}</span>
                  </label>
                ))
              )}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <Button
                toggle={false}
                primary={false}
                showIcon={false}
                label={isAttaching ? 'Attaching…' : 'Attach Existing Token to Selected Agents'}
                onClick={attachTokenToAgents}
                disabled={!primaryAccountId || !(tokenId ?? generatedTokenId) || selectedAgentIds.length === 0 || isAttaching}
              />
              {attachMessage && <span className="text-xs opacity-70">{attachMessage}</span>}
            </div>
          </div>
        ) : null}
        <div>
          <label className="boomi-form-label">Embed Snippet</label>
          <textarea
            className="boomi-input w-full rounded-md p-2 font-mono text-xs min-h-[140px]"
            readOnly
            value={snippet}
          />
          <div className="mt-2">
            <Button
              toggle={false}
              primary={false}
              showIcon={false}
              label={copiedSnippet ? 'Copied' : 'Copy Snippet'}
              onClick={() => copyText(snippet, setCopiedSnippet)}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default TokenModal;
