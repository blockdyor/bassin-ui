import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseConfig, validateConfig, defaultConfig } from '../src/helpers/config.ts';
import { parsePoolStatus, parseUserList, parseUser } from '../src/helpers/status.ts';
const fixture = readFileSync(new URL('../src/demodata/pool/pool.status', import.meta.url), 'utf8');
const config = { ...defaultConfig, btcd: [{ url: 'node:8332', auth: 'test', pass: 'test-only', notify: true }] };

test('CKPool status combines records and keeps zeros', () => {
  const pool = parsePoolStatus(fixture);
  assert.equal(pool.hashrate5m, '1.84T');
  assert.equal(pool.Workers, 2);
  assert.equal(parsePoolStatus(fixture.replace('"Workers": 2', '"Workers": 0')).Workers, 0);
});
test('invalid or incomplete status never becomes a live pool', () => {
  for (const text of ['<html>error</html>', '{}\n{}', '{}\n{}\n{}', fixture.replace('"runtime": 89405', '"runtime": "89405"'), fixture.replace('"hashrate5m": "1.84T"', '"hashrate5m": "oops"')]) assert.throws(() => parsePoolStatus(text));
});
test('user listing excludes traversal, remote URLs, and query links', () => {
  const html = `<a href="../">parent</a><a href="?sort=name">sort</a><a href="https://bad/a">external</a><a href="/private">absolute</a><a href="%2e%2e">encoded</a><a href="address.worker">one</a><a href='address.worker'>duplicate</a><a href="bc1_other">two</a>`;
  assert.deepEqual(parseUserList(html), ['address.worker', 'bc1_other']);
  assert.throws(() => parseUser({ worker: [null] }, 'address'));
  const valid = JSON.parse(readFileSync(new URL('../src/demodata/users/1BitcoinEaterAddressDontSendf59kuE', import.meta.url), 'utf8'));
  assert.equal(parseUser(valid, 'address').worker.length, 2);
  valid.worker[0].lastshare = Infinity;
  assert.throws(() => parseUser(valid, 'address'));
});
test('import/export preserves credentials, additional nodes, and unknown options', () => {
  const original = { ...config, btcd: [...config.btcd, { url: 'backup:8332', auth: 'backup', pass: 'keep-this' }], custom_option: { retained: true } };
  const parsed = parseConfig(JSON.stringify(original));
  parsed.startdiff = 128;
  const output = parseConfig(JSON.stringify(parsed));
  assert.deepEqual(output.btcd, original.btcd);
  assert.deepEqual(output.custom_option, original.custom_option);
  assert.deepEqual(validateConfig(output), []);
});
test('config rejects malformed roots and missing node credentials', () => {
  for (const raw of ['[]', 'null', 'true', '"text"']) assert.throws(() => parseConfig(raw));
  assert.ok(validateConfig(defaultConfig).length);
  assert.ok(validateConfig({ ...config, btcd: [null] }).length);
});
test('difficulty limits enforce integer values, minimum, start, and maximum', () => {
  assert.deepEqual(validateConfig(config), []);
  for (const values of [{ mindiff: 0 }, { startdiff: 1.5 }, { maxdiff: -1 }, { mindiff: 100, startdiff: 42 }, { maxdiff: 12 }, { startdiff: '42' }, { blockpoll: 0 }]) assert.ok(validateConfig({ ...config, ...values }).length, JSON.stringify(values));
  assert.deepEqual(validateConfig({ ...config, startdiff: 1000, maxdiff: 0 }), []);
});
test('coinbase limit uses UTF-8 bytes and ZMQ validates its endpoint', () => {
  assert.ok(validateConfig({ ...config, btcsig: 'é'.repeat(20) }).length);
  assert.deepEqual(validateConfig({ ...config, btcsig: 'a'.repeat(38), zmqblock: 'tcp://node:28332' }), []);
  assert.ok(validateConfig({ ...config, zmqblock: 'http://node' }).length);
});

test('ZMQ accepts reachable TCP endpoints, IPv6, and omission for the CKPool default', () => {
  for (const zmqblock of [undefined, 'tcp://bitcoin:28332', 'tcp://bitcoin_bitcoind_1:28332', 'tcp://192.168.1.20:1', 'tcp://node.example:65535', 'tcp://[::1]:28332', 'tcp://[2001:db8::1]:28332']) {
    assert.deepEqual(validateConfig({...config, zmqblock}), [], String(zmqblock));
  }
});
test('ZMQ rejects malformed addresses, bind wildcards, credentials, paths, and invalid ports', () => {
  for (const zmqblock of ['', null, 28332, 'tcp://node:0', 'tcp://node:65536', 'tcp://node:-1', 'tcp://node:2.5', 'tcp://node:28332/path', 'tcp://node:28332?query', 'tcp://user:pass@node:28332', 'tcp://node :28332', 'tcp://node:28332\n', 'tcp://*:28332', 'tcp://0.0.0.0:28332', 'tcp://[::]:28332', 'tcp://[not-ipv6]:28332', 'tcp://2001:db8::1:28332', 'tcp://999.1.1.1:28332']) {
    assert.ok(validateConfig({...config, zmqblock}).some(error => error.startsWith('ZMQ endpoint:')), String(zmqblock));
  }
});
test('notification-only imports remain valid without an explicit ZMQ endpoint', () => {
  // An external notifier can supply updates; do not force ZMQ or rewrite notify.
  const imported = {...config, ipcmining: '/custom/mining.sock', custom: {keep: true}};
  assert.deepEqual(validateConfig(imported), []);
  assert.deepEqual(parseConfig(JSON.stringify(imported)), imported);
});
