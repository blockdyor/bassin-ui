import assert from 'node:assert/strict'
import {test} from 'node:test'
import {duration, runningDetail} from '../src/helpers/display.ts'

test('duration formats sub-minute, minute, hour, day, and invalid runtimes cleanly', () => {
	assert.equal(duration(0), '< 1m')
	assert.equal(duration(59), '< 1m')
	assert.equal(duration(60), '1m')
	assert.equal(duration(3660), '1h 1m')
	assert.equal(duration(90000), '1d 1h')
	assert.equal(duration(-1), '—')
	assert.equal(duration(Number.NaN), '—')
})

test('runningDetail adapts to fresh startup, connected miners, SV2 channels, and share activity', () => {
	assert.equal(runningDetail({runtime: 0, Workers: 0, accepted: 0, rejected: 0}), '· Ready for miners')
	assert.equal(runningDetail({runtime: 45, Workers: 1, accepted: 0, rejected: 0}), '· Awaiting first share')
	assert.equal(
		runningDetail({runtime: 30, Workers: 0, accepted: 0, rejected: 0, sv2: {clients: 1, channels: 1}}),
		'· Awaiting first share',
	)
	assert.equal(runningDetail({runtime: 20, Workers: 1, accepted: 5, rejected: 0}), '· Just started')
	assert.equal(runningDetail({runtime: 300, Workers: 0, accepted: 0, rejected: 0}), 'for 5m · Ready for miners')
	assert.equal(runningDetail({runtime: 120, Workers: 2, accepted: 0, rejected: 0}), 'for 2m · Awaiting shares')
	assert.equal(runningDetail({runtime: 8100, Workers: 2, accepted: 100, rejected: 0}), 'for 2h 15m')
})
