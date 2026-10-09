export type Config = Record<string, unknown>;
export const defaultConfig: Config = {
  btcd: [{ url: '', auth: '', pass: '', notify: false }],
  btcsig: '/mined by Bassin on Umbrel/', mindiff: 1, startdiff: 42, maxdiff: 0, logdir: '/www',
};
export function parseConfig(text: string): Config {
  const value: unknown = JSON.parse(text);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuration must be a JSON object.');
  return value as Config;
}
// CKPool connects to this endpoint; it must not be a wildcard bind address.
export function zmqEndpointError(value: unknown): string | undefined {
  if (value === undefined) return;
  const message = 'Use tcp://host:port with a port from 1 to 65535 (IPv6: tcp://[address]:port).';
  if (typeof value !== 'string') return message;
  const match = /^tcp:\/\/(\[[^\]]+\]|[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.?):(\d+)$/.exec(value);
  if (!match || Number(match[2]) < 1 || Number(match[2]) > 65535) return message;
  try {
    // URL checks IPv6 syntax and malformed numeric IPv4 addresses as well.
    const endpoint = new URL(`http://${match[1]}:${match[2]}`);
    if (endpoint.hostname === '0.0.0.0' || endpoint.hostname === '[::]')
      return 'Use the Bitcoin node’s reachable address, not a wildcard bind address.';
  } catch {
    return message;
  }
}

export function validateConfig(config: Config): string[] {
  const errors: string[] = [];
  const positive = ['mindiff', 'startdiff', 'blockpoll', 'update_interval'];
  for (const key of [...positive, 'maxdiff', 'maxclients']) {
    const value = config[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive.includes(key) ? 1 : 0))) errors.push(`${key} must be a whole number ${positive.includes(key) ? 'greater than zero' : 'of zero or more'}.`);
  }
  const min = typeof config.mindiff === 'number' ? config.mindiff : 1;
  const start = typeof config.startdiff === 'number' ? config.startdiff : 10000;
  const max = typeof config.maxdiff === 'number' ? config.maxdiff : 0;
  if (start < min) errors.push('Starting difficulty cannot be below minimum difficulty.');
  if (max > 0 && (max < min || max < start)) errors.push('Maximum difficulty must be zero (unlimited) or at least the minimum and starting difficulty.');
  if (config.btcsig !== undefined && (typeof config.btcsig !== 'string' || new TextEncoder().encode(config.btcsig).length > 38)) errors.push('Coinbase signature must be text of at most 38 bytes.');
  if (config.logdir !== undefined && (typeof config.logdir !== 'string' || !config.logdir.trim())) errors.push('Log directory must be a nonempty path.');
  const zmqError = zmqEndpointError(config.zmqblock);
  if (zmqError) errors.push(`ZMQ endpoint: ${zmqError}`);
  if (config.serverurl !== undefined && (!Array.isArray(config.serverurl) || !config.serverurl.length || config.serverurl.some(url => typeof url !== 'string' || !/^.+:\d+$/.test(url)))) errors.push('Stratum listeners must be an array of host:port strings.');
  if (!Array.isArray(config.btcd) || config.btcd.length === 0) errors.push('Add at least one Bitcoin RPC node.');
  else config.btcd.forEach((node, i) => {
    if (!node || typeof node !== 'object' || typeof node.url !== 'string' || !/^.+:\d+$/.test(node.url) || typeof node.auth !== 'string' || !node.auth.trim() || typeof node.pass !== 'string' || !node.pass) errors.push(`Bitcoin node ${i + 1} needs a host:port, RPC username, and RPC password.`);
    if (node && typeof node === 'object' && node.notify !== undefined && typeof node.notify !== 'boolean') errors.push(`Bitcoin node ${i + 1}: notify must be true or false.`);
  });
  return errors;
}
