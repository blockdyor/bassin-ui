import assert from 'node:assert/strict'
import {test} from 'node:test'
import {abbreviateNumberPlain, parseHashrate} from '../src/helpers/convert.ts'
import {hashrate} from '../src/helpers/display.ts'
import {fetchUsers} from '../src/helpers/fetch.ts'
import {fetchLog} from '../src/helpers/logs.ts'
import {parseUser} from '../src/helpers/status.ts'

test('parseHashrate and display.hashrate handle CKPool scientific notation, exahash units, and invalid strings', () => {
	assert.equal(parseHashrate('1e+03G'), 1e12)
	assert.equal(parseHashrate('1e+03T'), 1e15)
	assert.equal(parseHashrate('1.5E'), 1.5e18)
	assert.equal(parseHashrate('1.84T'), 1.84e12)
	assert.equal(parseHashrate('0'), 0)
	assert.ok(Number.isNaN(parseHashrate('')))
	assert.ok(Number.isNaN(parseHashrate('oops')))

	assert.equal(abbreviateNumberPlain(1.5e18), '1.50 E')
	assert.equal(hashrate('1e+03G'), '1 TH/s')
	assert.equal(hashrate('1.84T'), '1.84 TH/s')
	assert.equal(hashrate('0'), '0H/s')
	assert.equal(hashrate('oops'), '—')
	assert.equal(hashrate(''), '—')
	assert.equal(hashrate(undefined), '—')

	const parsed = parseUser(
		{
			worker: [
				{
					workername: 'addr.rig1',
					hashrate5m: '1e+03G',
					hashrate1hr: '999G',
					hashrate1d: '1.2T',
					hashrate7d: '0',
					lastshare: 1761469089,
					shares: 100,
					bestshare: 50,
					bestever: 50,
				},
			],
		},
		'addr',
	)
	assert.equal(parsed.worker[0].hashrate5m, '1e+03G')
})

test('fetchLog treats HTTP 416 bytes */0 as an empty log instead of an error', async () => {
	const originalFetch = globalThis.fetch
	try {
		globalThis.fetch = async () =>
			new Response('', {
				status: 416,
				headers: {'Content-Range': 'bytes */0'},
			})
		const output = await fetchLog(new AbortController().signal)
		assert.equal(output, '')

		globalThis.fetch = async () =>
			new Response('', {
				status: 416,
				headers: {'Content-Range': 'bytes */1024'},
			})
		await assert.rejects(() => fetchLog(new AbortController().signal), /Request failed \(416\)/)
	} finally {
		globalThis.fetch = originalFetch
	}
})

test('fetchUsers keeps valid users when one listed file disappears or fails, and throws if all fail', async () => {
	const originalFetch = globalThis.fetch
	const validUser = {
		hashrate1m: '1T',
		hashrate5m: '1T',
		hashrate1hr: '1T',
		hashrate1d: '1T',
		hashrate7d: '1T',
		lastshare: 1761469089,
		workers: 1,
		shares: 10,
		bestshare: 10,
		bestever: 10,
		authorised: 1761469000,
		worker: [
			{
				workername: 'bc1qvalid.rig',
				hashrate1m: '1T',
				hashrate5m: '1T',
				hashrate1hr: '1T',
				hashrate1d: '1T',
				hashrate7d: '1T',
				lastshare: 1761469089,
				shares: 10,
				bestshare: 10,
				bestever: 10,
			},
		],
	}
	try {
		globalThis.fetch = async (url) => {
			if (String(url).endsWith('/users/')) {
				return new Response('<a href="bc1qvalid">bc1qvalid</a><a href="stale.tmp">stale.tmp</a>')
			}
			if (String(url).endsWith('/users/bc1qvalid')) {
				return new Response(JSON.stringify(validUser), {headers: {'Content-Type': 'application/json'}})
			}
			return new Response('not found', {status: 404})
		}
		const users = await fetchUsers(new AbortController().signal)
		assert.equal(users.length, 1)
		assert.equal(users[0].username, 'bc1qvalid')

		globalThis.fetch = async (url) => {
			if (String(url).endsWith('/users/')) {
				return new Response('<a href="missing1">missing1</a>')
			}
			return new Response('unavailable', {status: 503})
		}
		await assert.rejects(() => fetchUsers(new AbortController().signal), /Request failed \(503\)/)
	} finally {
		globalThis.fetch = originalFetch
	}
})
