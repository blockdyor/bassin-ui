import assert from 'node:assert/strict'
import {test} from 'node:test'
import {utcDateTime, utcTime, utcIso} from '../src/helpers/time.ts'
import {parsePoolVersion} from '../src/helpers/poolVersion.ts'

test('UTC formatting does not shift with browser timezone or daylight saving', () => {
	const before = process.env.TZ
	try {
		for (const zone of ['America/Los_Angeles', 'Europe/Rome', 'Asia/Kolkata']) {
			process.env.TZ = zone
			const timestamp = Date.parse('2026-03-29T01:30:05Z')
			assert.equal(utcDateTime(timestamp), '2026-03-29 01:30:05 UTC')
			assert.equal(utcTime(timestamp, false), '01:30')
			assert.equal(utcTime(timestamp), '01:30:05')
			assert.equal(utcDateTime(Date.parse('2026-10-07T00:00:00Z')), '2026-10-07 00:00:00 UTC')
		}
	} finally {
		if (before === undefined) delete process.env.TZ
		else process.env.TZ = before
	}
	assert.equal(utcDateTime(NaN), '—')
	assert.equal(utcIso(Infinity), undefined)
})
test('version metadata uses detected values without a release-specific default', () => {
	for (const version of ['1.2.0', '9.8.7', '2.0.0-rc.1'])
		assert.equal(parsePoolVersion({software: 'ckpool', version}), version)
	for (const value of [
		null,
		{},
		{software: 'bitcoin', version: '1.2.0'},
		{software: 'ckpool', version: 'unknown'},
		{software: 'ckpool', version: '<script>'},
	])
		assert.equal(parsePoolVersion(value), null)
})
