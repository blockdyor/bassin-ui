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

function validHostPort(value: unknown, allowHttpScheme = false, allowOptionalPort = false): boolean {
  if (typeof value !== 'string') return false;
  const target = allowHttpScheme ? value.replace(/^https?:\/\//i, '') : value;
  const withPort = /^(\[[^\]]+\]|[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.?):(\d+)$/.exec(target);
  if (withPort) {
    const port = Number(withPort[2]);
    if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return false;
    try {
      new URL(`http://${withPort[1]}:${port}`);
      return true;
    } catch {
      return false;
    }
  }
  if (!allowOptionalPort) return false;
  const hostOnly = /^(\[[^\]]+\]|[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*\.?)$/.exec(target);
  if (!hostOnly) return false;
  try {
    new URL(`http://${hostOnly[1]}:3336`);
    return true;
  } catch {
    return false;
  }
}

function validPathString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0 && !/[\x00-\x1f]/.test(value);
}

export function normalizeUrlList(value: unknown): string[] {
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim());
  return [];
}

function validateUrlField(value: unknown, allowOptionalPort = false): boolean {
  if (typeof value === 'string') return validHostPort(value, false, allowOptionalPort);
  if (!Array.isArray(value) || value.length === 0) return false;
  return value.every(url => validHostPort(url, false, allowOptionalPort));
}

export function validateConfig(config: Config): string[] {
  const errors: string[] = [];
  const positive = ['mindiff', 'startdiff', 'blockpoll', 'update_interval'];
  for (const key of [...positive, 'maxdiff', 'highdiff', 'maxclients', 'maxusers', 'maxsendqueue', 'dropidle']) {
    const value = config[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < (positive.includes(key) ? 1 : 0))) errors.push(`${key} must be a whole number ${positive.includes(key) ? 'greater than zero' : 'of zero or more'}.`);
  }
  if (config.maxsubclients !== undefined && (typeof config.maxsubclients !== 'number' || !Number.isSafeInteger(config.maxsubclients) || config.maxsubclients < -1)) {
    errors.push('maxsubclients must be a whole number of -1 (unlimited) or more.');
  }
  for (const key of ['nonce1length', 'nonce2length'] as const) {
    const value = config[key];
    if (value !== undefined && (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 2 || value > 8)) {
      errors.push(`${key} must be a whole number between 2 and 8.`);
    }
  }
  if (config.donation !== undefined && (typeof config.donation !== 'number' || !Number.isFinite(config.donation) || config.donation < 0 || (config.donation > 0 && config.donation < 0.1) || config.donation > 99.9)) {
    errors.push('Donation must be 0 (disabled) or between 0.1 and 99.9 percent.');
  }
  if (config.version_mask !== undefined && (typeof config.version_mask !== 'string' || !/^[0-9a-fA-F]{1,8}$/.test(config.version_mask))) {
    errors.push('Version mask must be a 1 to 8 character hexadecimal value (for example 1fffe000 or 0).');
  }
  if (config.reconnect !== undefined && typeof config.reconnect !== 'boolean') {
    errors.push('reconnect must be true or false.');
  }
  const min = typeof config.mindiff === 'number' ? config.mindiff : 1;
  const start = typeof config.startdiff === 'number' ? config.startdiff : 10000;
  const max = typeof config.maxdiff === 'number' ? config.maxdiff : 0;
  if (start < min) errors.push('Starting difficulty cannot be below minimum difficulty.');
  if (max > 0 && (max < min || max < start)) errors.push('Maximum difficulty must be zero (unlimited) or at least the minimum and starting difficulty.');
  if (config.btcsig !== undefined && (typeof config.btcsig !== 'string' || new TextEncoder().encode(config.btcsig).length > 38)) errors.push('Coinbase signature must be text of at most 38 bytes.');
  if (config.logdir !== undefined && !validPathString(config.logdir)) errors.push('Log directory must be a nonempty path.');
  if (config.ipcmining !== undefined && !validPathString(config.ipcmining)) errors.push('Mining IPC socket must be a nonempty path.');
  const zmqError = zmqEndpointError(config.zmqblock);
  if (zmqError) errors.push(`ZMQ endpoint: ${zmqError}`);
  if (config.serverurl !== undefined && !validateUrlField(config.serverurl, false)) errors.push('Stratum listeners must be host:port strings.');
  if (config.sv2url !== undefined && !validateUrlField(config.sv2url, true)) errors.push('Stratum V2 listeners must be host or host:port strings (default port 3336).');
  if (config.sv2jdurl !== undefined && !validateUrlField(config.sv2jdurl, true)) errors.push('Stratum V2 Job Declaration listeners must be host or host:port strings (default port 3337).');
  if (config.sv2_authority_key !== undefined && !validPathString(config.sv2_authority_key)) errors.push('SV2 authority key path must be a nonempty path.');
  if (config.sv2_static_key !== undefined && !validPathString(config.sv2_static_key)) errors.push('SV2 static key path must be a nonempty path.');
  if (!Array.isArray(config.btcd) || config.btcd.length === 0) errors.push('Add at least one Bitcoin RPC node.');
  else config.btcd.forEach((node, i) => {
    if (!node || typeof node !== 'object' || Array.isArray(node) || !validHostPort(node.url, true) || typeof node.auth !== 'string' || !node.auth.trim() || typeof node.pass !== 'string' || !node.pass) errors.push(`Bitcoin node ${i + 1} needs a host:port, RPC username, and RPC password.`);
    if (node && typeof node === 'object' && !Array.isArray(node) && node.notify !== undefined && typeof node.notify !== 'boolean') errors.push(`Bitcoin node ${i + 1}: notify must be true or false.`);
  });
  return errors;
}
