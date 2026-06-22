// api/_lib/anthropic.js — server-side Claude calls. API key stays in env, never client.
import { httpError } from './util.js';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';

// content: Anthropic message content array (text + image blocks)
export async function claude(content, { maxTokens = 8000, model = MODEL } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw httpError(500, 'AI is not configured.');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.error('Anthropic error:', res.status, t.slice(0, 300));
    throw httpError(502, 'The reading could not be completed. Please try again.');
  }
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  if (!text.trim()) throw httpError(502, 'The reading came back empty. Please try again.');
  return text;
}

// Build image blocks from data URLs (validates the declared media type).
export function imageBlock(dataUrl, label) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(dataUrl || ''));
  if (!m) return [];
  return [
    { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
    { type: 'text', text: label },
  ];
}
