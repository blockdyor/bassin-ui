import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {randomBytes, randomInt} from 'node:crypto'
import {existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'
import {pathToFileURL} from 'node:url'

const playwrightPath = process.env.PLAYWRIGHT_MODULE
assert.ok(playwrightPath, 'Set PLAYWRIGHT_MODULE to the Playwright entry module.')
const {chromium} = await import(pathToFileURL(playwrightPath).href)

const repoRoot = resolve(import.meta.dirname, '..')
const uiDir = resolve(repoRoot, 'web')
const work = mkdtempSync(join(tmpdir(), 'bassin-live-cfg-'))
const wwwDir = join(work, 'www')
const cfgDir = join(work, 'config')
mkdirSync(join(wwwDir, 'pool'), {recursive: true})
mkdirSync(join(wwwDir, 'users'), {recursive: true})
mkdirSync(cfgDir, {recursive: true})

const configPath = join(cfgDir, 'ckpool.conf')
const triggerPath = join(cfgDir, '.reload-trigger')
const sessionSecret = randomBytes(16).toString('hex')

writeFileSync(
	configPath,
	JSON.stringify(
		{
			btcd: [{url: '10.21.21.8:8332', auth: 'umbrel', pass: 'top-secret-password', notify: true}],
			zmqblock: 'tcp://10.21.21.8:28332',
			ipcmining: '/bitcoin/node.sock',
			btcsig: '/mined by Bassin on Umbrel/',
			mindiff: 1,
			startdiff: 42,
			maxdiff: 0,
			logdir: '/www',
		},
		null,
		2,
	) + '\n',
)
writeFileSync(
	join(wwwDir, 'pool/pool.status'),
	[
		JSON.stringify({runtime: 120, lastupdate: Math.floor(Date.now() / 1000), Users: 1, Workers: 1, Idle: 0, Disconnected: 0}),
		JSON.stringify({hashrate1m: '1.2T', hashrate5m: '1.2T', hashrate15m: '1.2T', hashrate1hr: '1.2T', hashrate6hr: '1.2T', hashrate1d: '1.2T', hashrate7d: '1.2T'}),
		JSON.stringify({diff: 42, accepted: 420, rejected: 0, bestshare: 999, SPS1m: 1, SPS5m: 1, SPS15m: 1, SPS1h: 1}),
	].join('\n') + '\n',
)
writeFileSync(join(wwwDir, 'pool/version.json'), JSON.stringify({software: 'ckpool', version: '1.2.0'}) + '\n')
writeFileSync(join(wwwDir, 'ckpool.log'), '[2026-11-22 18:00:00.000] CKPool started\n')

const port = randomInt(18080, 19080)
const pythonBin = process.env.PYTHON || '/usr/bin/python3'
const server = spawn(
	pythonBin,
	[
		resolve(repoRoot, 'scripts/bassin-server.py'),
		'--host',
		'127.0.0.1',
		'--port',
		String(port),
		'--ui-dir',
		uiDir,
		'--www-dir',
		wwwDir,
		'--config',
		configPath,
		'--config-token',
		sessionSecret,
	],
	{stdio: 'pipe'},
)

async function waitForServer(url) {
	for (let i = 0; i < 40; i++) {
		try {
			const res = await fetch(`${url}/health`)
			if (res.ok) return
		} catch {}
		await new Promise((r) => setTimeout(r, 150))
	}
	throw new Error('bassin-server.py did not start in time')
}

let browser
try {
	const baseUrl = `http://127.0.0.1:${port}`
	await waitForServer(baseUrl)

	browser = await chromium.launch({
		executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
		args: ['--no-sandbox'],
	})
	const page = await browser.newPage({viewport: {width: 1280, height: 900}})
	const pageErrors = []
	page.on('pageerror', (e) => pageErrors.push(e.message))
	page.on('dialog', (dialog) => dialog.accept())

	// 1. Settings starts locked (401) until unlocked with Bearer token.
	await page.goto(`${baseUrl}/#/settings`, {waitUntil: 'networkidle'})
	await page.getByTestId('config-auth-gate').waitFor()

	// Logs tab stays accessible even while Settings is locked.
	await page.getByRole('tab', {name: 'Logs'}).click()
	await page.getByText('CKPool started').waitFor()

	// Unlock with valid token.
	await page.getByRole('tab', {name: 'Mining'}).click()
	await page.getByLabel('Bassin config password').fill(sessionSecret)
	await page.getByRole('button', {name: 'Unlock Settings'}).click()
	await page.getByTestId('live-config-status').waitFor()
	assert.match(await page.getByTestId('live-config-status').textContent(), /Live · Connected/)
	assert.equal(await page.getByText('Before saving').count(), 0)

	// 2. Toggle Stratum V2 ON -> must NOT auto-save before explicit Save click!
	await page.getByRole('tab', {name: 'Stratum V2'}).click()
	await page.getByRole('switch', {name: 'Enable Stratum V2 Mining'}).click()
	await page.waitForTimeout(800)
	const beforeSave = JSON.parse(readFileSync(configPath, 'utf8'))
	assert.equal(beforeSave.sv2url, undefined)
	assert.equal(existsSync(triggerPath), false)

	// 3. Explicit Save (no restart) writes config, preserves RPC password, and does NOT write .reload-trigger!
	await page.getByRole('button', {name: 'Save', exact: true}).click()
	await page.waitForFunction(
		() => document.querySelector('[data-testid="live-config-status"]')?.textContent?.includes('Saved to ckpool.conf'),
		null,
		{timeout: 5000},
	)
	const afterSave = JSON.parse(readFileSync(configPath, 'utf8'))
	assert.deepEqual(afterSave.sv2url, ['0.0.0.0:3336'])
	assert.equal(afterSave.btcd[0].pass, 'top-secret-password')
	assert.equal(existsSync(triggerPath), false)

	// 4. Explicit Save & Restart Pool triggers .reload-trigger (after confirming active workers).
	await page.getByRole('button', {name: 'Save & Restart Pool'}).click()
	await page.waitForFunction(
		() => document.querySelector('[data-testid="live-config-status"]')?.textContent?.includes('restart triggered'),
		null,
		{timeout: 5000},
	)
	assert.equal(existsSync(triggerPath), true)

	// 5. Lock button clears session token and returns to auth gate.
	await page.getByRole('button', {name: 'Lock'}).click()
	await page.getByTestId('config-auth-gate').waitFor()

	assert.deepEqual(pageErrors, [])
	console.log('Hardened live config browser test passed!')
} finally {
	await browser?.close()
	server.kill('SIGTERM')
	rmSync(work, {recursive: true, force: true})
}
