import {mkdtemp} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

export async function createScreenshotDir() {
	const dir = await mkdtemp(join(tmpdir(), 'bassin-screenshots-'))
	console.log(`Screenshots: ${dir}`)
	return dir
}
