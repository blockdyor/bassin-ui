import { safeFetch } from './fetch';
export const MAX_LOG_BYTES = 65536;
export async function fetchLog(signal: AbortSignal): Promise<string> {
  const response = await safeFetch('/ckpool.log', signal, { Range: `bytes=-${MAX_LOG_BYTES}` });
  if (response.headers.get('content-type')?.includes('text/html')) { await response.body?.cancel(); throw new Error('The server returned a page instead of the CKPool log.'); }
  const length = Number(response.headers.get('content-length'));
  if (length > MAX_LOG_BYTES) { await response.body?.cancel(); throw new Error('The server must support HTTP byte ranges to read this large log.'); }
  const reader = response.body?.getReader();
  if (!reader) return '';
  let size = 0;
  let result = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_LOG_BYTES) throw new Error('The server must support HTTP byte ranges to read this large log.');
      result += decoder.decode(value, { stream: true });
    }
    result += decoder.decode();
  } finally { await reader.cancel(); }
  const start = Number(response.headers.get('content-range')?.match(/^bytes (\d+)-/)?.[1] ?? 0);
  if (start > 0) result = result.includes('\n') ? result.slice(result.indexOf('\n') + 1) : '';
  // Strip terminal control sequences; log text is always rendered as text, never HTML.
  return result.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').split('\n').slice(-400).join('\n');
}
export function logLevel(line: string): 'error' | 'warning' | 'info' {
  return /\b(error|fatal|failed|failure|emerg|alert|crit)\b/i.test(line) ? 'error' : /\b(warn(?:ing)?|reject(?:ed)?|invalid)\b/i.test(line) ? 'warning' : 'info';
}
