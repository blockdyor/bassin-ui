import assert from 'node:assert/strict'
import {rm, stat} from 'node:fs/promises'
import {test} from 'node:test'
import {createScreenshotDir} from './screenshots.mjs'

test('each capture gets a separate private directory', async (t) => {
	const capture = async () => {
		const dir = await createScreenshotDir()
		t.after(() => rm(dir, {recursive: true, force: true}))
		return dir
	}
	const [first, second] = await Promise.all([capture(), capture()])
	assert.notEqual(first, second)
	if (process.platform !== 'win32') assert.equal((await stat(first)).mode & 0o077, 0)
})
