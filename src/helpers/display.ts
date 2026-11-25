import { abbreviateNumberPlain, parseHashrate } from './convert.ts';
export function number(value: number | undefined): string {
  return value === undefined || !Number.isFinite(value) ? '—' : abbreviateNumberPlain(value);
}
export function hashrate(value: string | undefined): string {
  if (value === undefined) return '—';
  const parsed = parseHashrate(value);
  return Number.isFinite(parsed) && parsed >= 0 ? number(parsed) + 'H/s' : '—';
}
export interface PoolActivity {
  runtime: number;
  Workers: number;
  accepted: number;
  rejected: number;
  sv2?: { clients: number; channels: number };
}
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return '< 1m';
}
export function runningDetail(pool: PoolActivity): string {
  const totalShares = (pool.accepted || 0) + (pool.rejected || 0);
  const connectedMiners = (pool.Workers || 0) + (pool.sv2?.channels || pool.sv2?.clients || 0);
  const fresh = !Number.isFinite(pool.runtime) || pool.runtime < 60;
  if (fresh) {
    if (totalShares > 0) return '· Just started';
    return connectedMiners > 0 ? '· Awaiting first share' : '· Ready for miners';
  }
  const uptime = `for ${duration(pool.runtime)}`;
  if (totalShares > 0) return uptime;
  return connectedMiners > 0 ? `${uptime} · Awaiting shares` : `${uptime} · Ready for miners`;
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
