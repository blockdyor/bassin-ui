import assert from 'node:assert/strict'
import {test} from 'node:test'
import {parsePoolLocation} from '../src/helpers/location.ts'
test('marker requires fresh, finite, node-derived location data', () => {
	const now = Date.now(),
		valid = {source: 'bitcoin-node', ip: '8.8.8.8', latitude: 0, longitude: 0, updatedAt: now}
	assert.deepEqual(parsePoolLocation(valid, now), valid)
	for (const change of [
		{source: 'visitor'},
		{source: undefined},
		{latitude: NaN},
		{latitude: 91},
		{longitude: 181},
		{updatedAt: now - 49 * 3600000},
		{updatedAt: now + 120000},
		{ip: ''},
	])
		assert.equal(parsePoolLocation({...valid, ...change}, now), null)
	for (const invalid of [null, undefined, {}, 'location']) assert.equal(parsePoolLocation(invalid, now), null)
})
