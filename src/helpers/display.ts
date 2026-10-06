import { abbreviateNumberPlain, parseHashrate } from './convert';
export function number(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '—' : abbreviateNumberPlain(value);
}
export function hashrate(value: string | undefined): string {
  return value === undefined ? '—' : number(parseHashrate(value)) + 'H/s';
}
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}
export function age(timestamp: number, now = Date.now()): string {
  if (!timestamp) return 'Never';
  const seconds = Math.max(0, now / 1000 - timestamp);
  return seconds < 60 ? 'Just now' : `${duration(seconds)} ago`;
}
export function download(content: string, filename: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
