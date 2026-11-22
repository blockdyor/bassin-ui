import { parsePoolStatus, parseUser, parseUserList } from './status.ts';

export async function fetchWithTimeout(url: string, signal?: AbortSignal, headers?: HeadersInit): Promise<Response> {
  return fetch(url, {
    cache: 'no-store',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000),
    headers,
  });
}

export async function safeFetch(url: string, signal?: AbortSignal, headers?: HeadersInit): Promise<Response> {
  const response = await fetchWithTimeout(url, signal, headers);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Request failed (${response.status})`);
  }
  return response;
}
export async function fetchPool(signal?: AbortSignal) {
  const response = await safeFetch('/pool/pool.status', signal);
  return parsePoolStatus(await response.text());
}
export async function fetchUsers(signal?: AbortSignal) {
  const response = await safeFetch(import.meta.env?.DEV ? '/users/users.status' : '/users/', signal);
  const usernames = parseUserList(await response.text());
  // Bound concurrent reads when a pool has many addresses, and tolerate single-file races.
  const users = [];
  let firstError: unknown;
  for (let offset = 0; offset < usernames.length; offset += 8) {
    if (signal?.aborted) throw signal.reason ?? new Error('Aborted');
    const batch = await Promise.allSettled(usernames.slice(offset, offset + 8).map(async username => {
      const response = await safeFetch(`/users/${encodeURIComponent(username)}`, signal);
      return parseUser(await response.json(), username);
    }));
    for (const result of batch) {
      if (result.status === 'fulfilled') users.push(result.value);
      else if (firstError === undefined) firstError = result.reason;
    }
  }
  if (usernames.length > 0 && users.length === 0) {
    throw firstError instanceof Error ? firstError : new Error('Unable to load worker data');
  }
  return users;
}
