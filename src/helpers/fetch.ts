import { parsePoolStatus, parseUser, parseUserList } from './status';

export async function safeFetch(url: string, signal?: AbortSignal, headers?: HeadersInit): Promise<Response> {
  const response = await fetch(url, {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
    headers,
  });
  if (!response.ok) throw new Error(`Request failed (${response.status})`);
  return response;
}
export async function fetchPool(signal?: AbortSignal) {
  const response = await safeFetch('/pool/pool.status', signal);
  return parsePoolStatus(await response.text());
}
export async function fetchUsers(signal?: AbortSignal) {
  const response = await safeFetch(import.meta.env.DEV ? '/users/users.status' : '/users/', signal);
  const usernames = parseUserList(await response.text());
  // Bound concurrent reads when a pool has many addresses.
  const users = [];
  for (let offset = 0; offset < usernames.length; offset += 8) {
    users.push(...await Promise.all(usernames.slice(offset, offset + 8).map(async username => {
      const response = await safeFetch(`/users/${encodeURIComponent(username)}`, signal);
      return parseUser(await response.json(), username);
    })));
  }
  return users;
}
