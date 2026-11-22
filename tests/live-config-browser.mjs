import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {randomInt} from 'node:crypto'
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
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
writeFileSync(
	configPath,
	JSON.stringify(
		{
			btcd: [{url: '10.21.21.8:8332', auth: 'umbrel', pass: 'top-secret-password', notify: true}],
			zmqblock: 'tcp://10.21.21.8:28332',
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
	],
	{stdio: 'pipe'},
)

async function waitForServer(url) {
	for (let i = 0; i < 40; i++) {
		try {
			const res = await fetch(`${url}/api/config`)
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

	await page.goto(`${baseUrl}/#/settings`, {waitUntil: 'networkidle'})
	await page.getByTestId('live-config-status').waitFor()
	assert.match(await page.getByTestId('live-config-status').textContent(), /Live · Changes auto-save/)

	// Ensure there are ZERO validation errors on initial load (even though RPC password is masked!).
	assert.equal(await page.getByText('Before saving').count(), 0)
	assert.equal(await page.getByText('Before downloading').count(), 0)

	// Verify Bitcoin Node tab masks password and shows saved placeholder.
	await page.getByRole('tab', {name: 'Bitcoin Node'}).click()
	assert.equal(await page.locator('#node-url').inputValue(), '10.21.21.8:8332')
	assert.equal(await page.locator('#node-auth').inputValue(), 'umbrel')
	assert.equal(await page.locator('#node-pass').inputValue(), '')
	assert.match(await page.locator('#node-pass').getAttribute('placeholder'), /Saved on server/)

	// Toggle Stratum V2 ON -> auto-saves cleanly with ZERO errors and preserves RPC password on disk!
	await page.getByRole('tab', {name: 'Stratum V2'}).click()
	await page.getByRole('switch', {name: 'Enable Stratum V2 Mining'}).click()
	await page.waitForFunction(
		() => document.querySelector('[data-testid="live-config-status"]')?.textContent?.includes('Saved'),
		null,
		{timeout: 5000},
	)
	assert.equal(await page.getByText('Before saving').count(), 0)

	const saved = JSON.parse(readFileSync(configPath, 'utf8'))
	assert.deepEqual(saved.sv2url, ['0.0.0.0:3336'])
	assert.equal(saved.sv2_authority_key, '/sv2/sv2_authority.key')
	assert.equal(saved.sv2_static_key, '/sv2/sv2_static.key')
	assert.equal(saved.btcd[0].pass, 'top-secret-password')

	// Also edit Coinbase Signature in Mining tab -> auto-saves to disk.
	await page.getByRole('tab', {name: 'Mining'}).click()
	await page.locator('#field-btcsig').fill('/solo mined live/')
	await page.waitForTimeout(800)
	const savedAfterSig = JSON.parse(readFileSync(configPath, 'utf8'))
	assert.equal(savedAfterSig.btcsig, '/solo mined live/')
	assert.equal(savedAfterSig.btcd[0].pass, 'top-secret-password')

	// Confirm Connect -> Stratum V2 reflects enabled state (no "Stratum V2 is disabled" banner).
	await page.getByRole('button', {name: 'Connect'}).click()
	await page.getByRole('tab', {name: 'Stratum V2'}).click()
	assert.equal(await page.getByText('Stratum V2 is disabled').count(), 0)

	assert.deepEqual(pageErrors, [])
	console.log('Live config auto-save browser test passed!')
} finally {
	await browser?.close()
	server.kill('SIGTERM')
	rmSync(work, {recursive: true, force: true})
}
