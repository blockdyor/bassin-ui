import assert from 'node:assert/strict'
import {test} from 'node:test'
import {bestShareEver} from '../src/helpers/mining.ts'

test('best-ever comes from persisted records, including disconnected workers, not current shares', () => {
	assert.equal(bestShareEver([]), undefined)
	assert.equal(bestShareEver([{bestshare: 9999, bestever: 40, worker: [{bestever: 80}]}]), 80)
	assert.equal(
		bestShareEver([
			{bestever: 100, worker: [{bestever: 20}]},
			{bestever: 250, worker: []},
		]),
		250,
	)
	assert.equal(bestShareEver([{bestever: NaN, worker: [{bestever: -1}, {bestever: Infinity}]}]), undefined)
	assert.equal(bestShareEver([{bestever: 0, worker: []}]), 0)
})
