import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {test} from 'node:test'
import {defaultConfig, normalizeUrlList, validateConfig} from '../src/helpers/config.ts'
import {parsePoolStatus} from '../src/helpers/status.ts'
import {formatSv2Url, parsePoolSv2} from '../src/helpers/sv2.ts'

const fixture = readFileSync(new URL('../src/demodata/pool/pool.status', import.meta.url), 'utf8')
const baseConfig = {...defaultConfig, btcd: [{url: '10.21.21.7:9332', auth: 'umbrel', pass: 'secret', notify: true}]}

test('parsePoolStatus parses optional Stratum V2 and Job Declaration lines without clobbering core fields', () => {
	const withSv2 = [
		fixture.trim(),
		JSON.stringify({clients: 3, channels: 5, jdclients: 1}),
		JSON.stringify({
			sv2jd: true,
			allocate_ok: 4,
			allocate_rate_limited: 0,
			declare_ok: 12,
			declare_error: 1,
			declare_rate_limited: 0,
			checkblock_busy: 0,
			checkblock_fail: 0,
			checkblock_inflight: 0,
			coalesce_hit: 2,
			provide_missing: 0,
			push_solution: 1,
			tokens: 2,
			tx_cache: 150,
			tx_cache_bytes: 40960,
			token_snapshot_bytes: 1024,
			pending_declares: 0,
		}),
	].join('\n')
	const pool = parsePoolStatus(withSv2)
	assert.equal(pool.Workers, 2)
	assert.deepEqual(pool.sv2, {clients: 3, channels: 5, jdclients: 1})
	assert.equal(pool.sv2jd?.declare_ok, 12)
	assert.equal(pool.sv2jd?.tokens, 2)
	assert.equal(pool.sv2jd?.push_solution, 1)
})

test('parsePoolSv2 validates public SV2 metadata and rejects malformed pubkeys', () => {
	const valid = {
		enabled: true,
		jdEnabled: true,
		sv2Urls: ['0.0.0.0:3336'],
		sv2JdUrls: ['0.0.0.0:3337'],
		authorityPubkey: '9auqWEzQGCt2s1Y8V7uV7K3t9xN4qP6mR2kL8wX5jH1cB3dE7fG',
		ephemeralKeys: false,
	}
	assert.deepEqual(parsePoolSv2(valid), valid)
	assert.equal(parsePoolSv2({...valid, authorityPubkey: null})?.authorityPubkey, null)
	assert.equal(parsePoolSv2({...valid, authorityPubkey: 'bad-0OIl-key'}), null)
	assert.equal(parsePoolSv2({...valid, enabled: 'yes'}), null)
	assert.equal(
		formatSv2Url('umbrel.local', 3457, valid.authorityPubkey),
		`stratum2+tcp://umbrel.local:3457/${valid.authorityPubkey}`,
	)
	assert.equal(formatSv2Url('umbrel.local', 3457, null), 'stratum2+tcp://umbrel.local:3457/<authority-pubkey>')
})

test('validateConfig supports Stratum V2, Job Declaration, and advanced CKPool options', () => {
	const full = {
		...baseConfig,
		sv2url: ['0.0.0.0:3336', '[::]:3336', '0.0.0.0'],
		sv2jdurl: '0.0.0.0:3337',
		sv2_authority_key: '/sv2/sv2_authority.key',
		sv2_static_key: '/sv2/sv2_static.key',
		highdiff: 100000,
		donation: 0.5,
		version_mask: '1fffe000',
		dropidle: 3600,
		nonce1length: 4,
		nonce2length: 8,
		maxclients: 100,
		maxusers: 50,
		maxsubclients: -1,
		maxsendqueue: 1048576,
		reconnect: false,
		ipcmining: '/run/bitcoind/mining.sock',
		serverurl: '0.0.0.0:3333',
	}
	assert.deepEqual(validateConfig(full), [])
	assert.deepEqual(normalizeUrlList('0.0.0.0:3336'), ['0.0.0.0:3336'])
	assert.deepEqual(normalizeUrlList(['0.0.0.0:3336', '']), ['0.0.0.0:3336'])

	for (const bad of [
		{sv2url: ['0.0.0.0:70000']},
		{sv2url: []},
		{sv2jdurl: ['bad host:3337']},
		{sv2_authority_key: ''},
		{sv2_static_key: '   '},
		{donation: 0.05},
		{donation: 100},
		{version_mask: 'nothex'},
		{version_mask: '123456789'},
		{nonce1length: 1},
		{nonce2length: 9},
		{maxsubclients: -2},
		{dropidle: -1},
		{reconnect: 'true'},
		{ipcmining: ''},
	]) {
		assert.ok(validateConfig({...baseConfig, ...bad}).length > 0, JSON.stringify(bad))
	}
})

test('validateConfig accepts omitted RPC password when stored server-side', () => {
	const masked = {
		...defaultConfig,
		btcd: [{url: '10.21.21.7:9332', auth: 'umbrel', notify: true}],
		sv2url: ['0.0.0.0:3336'],
	}
	assert.ok(validateConfig(masked).some((e) => e.includes('Bitcoin node 1')))
	assert.deepEqual(validateConfig(masked, {passwordsSet: [true]}), [])
	assert.ok(validateConfig(masked, {passwordsSet: [false]}).length > 0)
})
