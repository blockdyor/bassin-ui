import type { Pool } from '../interfaces/pool';
import type { User } from '../interfaces/users';

export function parsePoolStatus(text: string): Pool {
  const lines = text.trim().split('\n').filter(line => line.trim());
  if (lines.length < 3) throw new Error('Incomplete CKPool status');
  const parts = lines.map(line => JSON.parse(line));
  if (parts.some(part => !part || typeof part !== 'object' || Array.isArray(part))) throw new Error('Invalid CKPool status');
  const pool = Object.assign({}, ...parts);
  for (const key of ['runtime', 'lastupdate', 'Users', 'Workers', 'accepted', 'rejected', 'bestshare', 'SPS1m']) {
    if (typeof pool[key] !== 'number' || !Number.isFinite(pool[key]) || pool[key] < 0) throw new Error(`Invalid pool field: ${key}`);
  }
  for (const key of ['hashrate1m', 'hashrate5m', 'hashrate1hr', 'hashrate1d', 'hashrate7d']) {
    if (typeof pool[key] !== 'string' || !/^\d+(?:\.\d+)?\s*[KMGTPEZY]?H?(?:\/s)?$/i.test(pool[key])) throw new Error(`Invalid pool field: ${key}`);
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
      if (typeof worker[key] !== 'string' || !/^\d+(?:\.\d+)?\s*[KMGTPEZY]?H?(?:\/s)?$/i.test(worker[key])) throw new Error(`Invalid worker field: ${key}`);
    }
  }
  return { ...data, username } as User;
}
