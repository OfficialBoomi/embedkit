/**
 * @file message.ts
 * @module agent/utils/message
 * @license BSD-2-Clause
 * @support https://bitbucket.org/officialboomi/embedkit
 *
 * @description
 * Utilities for safely extracting text from heterogeneous ChatMessage payloads.
 */

type AnyMessage = { type?: string; content?: unknown; role?: string };

/**
 * Safely extract displayable text from a chat message.
 * Supports canonical shape { type: 'text', content: { text: string } }
 * and common fallbacks like content: string or content: { data }.
 */
export function getMsgText(m: AnyMessage): string {
  if (m?.type === 'text' && m?.content && typeof (m as any).content.data === 'string') {
    return (m as any).content.data;
  }
  const c = (m as any)?.content;
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object' && 'text' in c && typeof (c as any).data === 'string') {
    return (c as any).text;
  }
  return '';
}
