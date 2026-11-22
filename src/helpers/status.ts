import type { Pool, PoolSv2JdStats, PoolSv2Stats } from '../interfaces/pool';
import type { User } from '../interfaces/users';

const HASHRATE_PATTERN = /^\d+(?:\.\d+)?(?:e[+-]?\d+)?\s*[KMGTPEZY]?H?(?:\/s)?$/i;

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function parseSv2Stats(part: Record<string, unknown>): PoolSv2Stats | undefined {
  if (isNonNegativeFinite(part.clients) && isNonNegativeFinite(part.channels) && isNonNegativeFinite(part.jdclients)) {
    return { clients: part.clients, channels: part.channels, jdclients: part.jdclients };
  }
}

const SV2_JD_KEYS: (keyof PoolSv2JdStats)[] = [
  'allocate_ok', 'allocate_rate_limited', 'declare_ok', 'declare_error', 'declare_rate_limited',
  'checkblock_busy', 'checkblock_fail', 'checkblock_inflight', 'coalesce_hit', 'provide_missing',
  'push_solution', 'tokens', 'tx_cache', 'tx_cache_bytes', 'token_snapshot_bytes', 'pending_declares',
];

function parseSv2JdStats(part: Record<string, unknown>): PoolSv2JdStats | undefined {
  if (part.sv2jd !== true) return;
  const stats: Partial<PoolSv2JdStats> = {};
  for (const key of SV2_JD_KEYS) {
    const value = part[key];
    stats[key] = isNonNegativeFinite(value) ? value : 0;
  }
  return stats as PoolSv2JdStats;
}

export function parsePoolStatus(text: string): Pool {
  const lines = text.trim().split('\n').filter(line => line.trim());
  if (lines.length < 3) throw new Error('Incomplete CKPool status');
  const parts = lines.map(line => JSON.parse(line));
  if (parts.some(part => !part || typeof part !== 'object' || Array.isArray(part))) throw new Error('Invalid CKPool status');
  const pool = Object.assign({}, ...parts.slice(0, 3));
  for (const key of ['runtime', 'lastupdate', 'Users', 'Workers', 'accepted', 'rejected', 'bestshare', 'SPS1m']) {
    if (!isNonNegativeFinite(pool[key])) throw new Error(`Invalid pool field: ${key}`);
  }
  for (const key of ['hashrate1m', 'hashrate5m', 'hashrate1hr', 'hashrate1d', 'hashrate7d']) {
    if (typeof pool[key] !== 'string' || !HASHRATE_PATTERN.test(pool[key].trim())) throw new Error(`Invalid pool field: ${key}`);
  }
  for (const extra of parts.slice(3)) {
    const record = extra as Record<string, unknown>;
    const sv2 = parseSv2Stats(record);
    if (sv2) pool.sv2 = sv2;
    const sv2jd = parseSv2JdStats(record);
    if (sv2jd) pool.sv2jd = sv2jd;
  }
  return pool as Pool;
}
export function parseUserList(text: string): string[] {
  return [...new Set([...text.matchAll(/href=["']([^"']+)["']/g)].map(([, name]) => name.replace(/\/$/, '')).filter(name => name !== '.' && name !== '..' && /^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(name)))];
}
export function parseUser(data: unknown, username: string): User {
  if (!data || typeof data !== 'object' || !('worker' in data) || !Array.isArray(data.worker)) throw new Error('Invalid worker status');
  for (const worker of data.worker) {
    if (!worker || typeof worker.workername !== 'string' || typeof worker.hashrate5m !== 'string' || typeof worker.lastshare !== 'number') throw new Error('Invalid worker');
    for (const key of ['lastshare', 'shares', 'bestshare', 'bestever']) {
      if (typeof worker[key] !== 'number' || !Number.isFinite(worker[key]) || worker[key] < 0) throw new Error(`Invalid worker field: ${key}`);
    }
    if (worker.lastshare > 8640000000000) throw new Error('Worker timestamp out of range');
    for (const key of ['hashrate5m', 'hashrate1hr', 'hashrate1d', 'hashrate7d']) {
      if (typeof worker[key] !== 'string' || !HASHRATE_PATTERN.test(worker[key].trim())) throw new Error(`Invalid worker field: ${key}`);
    }
  }
  return { ...data, username } as User;
}
