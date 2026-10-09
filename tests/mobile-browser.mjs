import assert from 'node:assert/strict'
import {readFile, mkdir} from 'node:fs/promises'
const {chromium, webkit, devices} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const engine = process.env.BASSIN_BROWSER || 'webkit'
const browser = await (engine === 'webkit' ? webkit : chromium).launch({
	headless: true,
	...(engine === 'chromium' ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {}),
})
const base = process.env.BASSIN_TEST_URL || 'http://127.0.0.1:4174'
const output = '/tmp/bassin-mobile-review'
await mkdir(output, {recursive: true})
const fixture = await readFile(new URL('../src/demodata/pool/pool.status', import.meta.url), 'utf8')
const users = await readFile(
	new URL('../src/demodata/users/1BitcoinEaterAddressDontSendf59kuE', import.meta.url),
	'utf8',
)
const profiles = process.env.BASSIN_DEVICES?.split(',') || ['iPhone SE', 'iPhone 13', 'iPad Mini']
const cycles = Number(process.env.BASSIN_CYCLES || 10)
try {
	for (const device of profiles) {
		const context = await browser.newContext({...devices[device], reducedMotion: 'no-preference'})
		await context.addInitScript(() => {
			const original = HTMLCanvasElement.prototype.getContext
			const seen = new WeakSet()
			window.__gpu = {created: 0, lost: 0, refs: []}
			HTMLCanvasElement.prototype.getContext = function (type, ...args) {
				const gl = original.call(this, type, ...args)
				if (gl && /^webgl2?$/.test(type) && !seen.has(gl)) {
					seen.add(gl)
					window.__gpu.created++
					window.__gpu.refs.push(new WeakRef(gl))
					this.addEventListener('webglcontextlost', () => window.__gpu.lost++)
				}
				return gl
			}
		})
		const page = await context.newPage()
		page.setDefaultTimeout(30000)
		const errors = [],
			warnings = []
		page.on('crash', () => errors.push('Browser page crashed'))
		page.on('pageerror', (e) => errors.push(e.message))
		page.on('console', (m) => {
			if (
				!m.text().includes('loseContext: context already lost') &&
				/Too many active WebGL|INVALID_OPERATION|GL_OUT_OF_MEMORY|Error creating WebGL|Shader Error/.test(m.text())
			)
				warnings.push(m.text())
		})
		await page.route('**/pool/version.json', (r) => r.fulfill({json: {software: 'ckpool', version: '1.2.0'}}))
		await page.route('**/pool/location.json', (r) =>
			r.fulfill({
				json: {source: 'bitcoin-node', ip: '203.0.113.1', latitude: 51.5, longitude: 0, updatedAt: Date.now()},
			}),
		)
		await page.route('**/pool/pool.status', (r) => {
			const rows = fixture.trim().split('\n').map(JSON.parse)
			rows[0].lastupdate = Math.floor(Date.now() / 1000)
			return r.fulfill({body: rows.map(JSON.stringify).join('\n')})
		})
		await page.route(/\/users\/(?:users\.status)?$/, (r) =>
			r.fulfill({body: '<a href="1BitcoinEaterAddressDontSendf59kuE">1BitcoinEaterAddressDontSendf59kuE</a>'}),
		)
		await page.route('**/users/1BitcoinEaterAddressDontSendf59kuE', (r) => r.fulfill({body: users}))
		await page.route('**/ckpool.log', (r) => r.fulfill({body: '[2026-10-07 12:00:00] Accepted share'}))
		await page.goto(base)
		await page.getByText('Running', {exact: true}).waitFor()
		await page.locator('[data-testid=pool-globe] canvas').waitFor()
		await page.waitForTimeout(10000)
		assert.equal(await page.getByTestId('pool-globe').getAttribute('data-marker-count'), '1')
		assert.equal(await page.locator('header p').textContent(), 'Bassin v2.1.10 · CKPool v1.2.0')
		const width = devices[device].viewport.width
		for (const viewport of [
			devices[device].viewport,
			{width: devices[device].viewport.height, height: width},
			devices[device].viewport,
		]) {
			await page.setViewportSize(viewport)
			await page.waitForTimeout(500)
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${device}: overflow`)
		}
		const hero = await page.locator('[data-testid=home-hero]').boundingBox()
		await page.mouse.move(hero.x + 70, hero.y + 120)
		await page.mouse.down()
		await page.mouse.move(hero.x + 170, hero.y + 150, {steps: 12})
		await page.mouse.up()
		await page.waitForTimeout(300)
		await page.screenshot({path: `${output}/${engine}-${device.replaceAll(' ', '-')}-home.png`})
		for (const label of ['Share quality', 'Rejected']) {
			const box = await page.getByText(label, {exact: true}).last().boundingBox()
			assert.ok(box.x >= 0 && box.x + box.width <= width, `${device}: clipped ${label}`)
		}
		// An interrupted GPU must fall back safely without taking down the dashboard.
		await page.locator('[data-testid=pool-globe] canvas').evaluate((canvas) => {
			canvas.getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()
		})
		await page.getByRole('img', {name: 'Bitcoin network globe', exact: true}).waitFor()
		assert.equal(await page.locator('[data-testid=pool-globe] canvas').count(), 0)

		await page.getByRole('button', {name: 'Connect', exact: true}).tap()
		await page.getByRole('tab', {name: 'Worker Setup', exact: true}).tap()
		await page.getByText(/Bassin charges no pool commission/).waitFor()
		await page.screenshot({path: `${output}/${engine}-${device.replaceAll(' ', '-')}-worker.png`})
		await page.getByRole('button', {name: 'Close connection details', exact: true}).tap()
		for (let i = 0; i < cycles; i++) {
			for (const route of ['insights', 'settings', '']) {
				await page.locator(`a[href="#/${route}"]`).tap()
				await page.waitForTimeout(route ? 800 : 1500)
			}
			const gpu = await page.evaluate(() => ({
				created: window.__gpu.created,
				lost: window.__gpu.lost,
				active: window.__gpu.refs.filter((r) => {
					const gl = r.deref()
					return gl instanceof WebGL2RenderingContext && !gl.isContextLost()
				}).length,
			}))
			console.log(engine, device, 'navigation cycle', i + 1, JSON.stringify(gpu))
			assert.equal(gpu.active, 2, 'Navigation must not accumulate 3D contexts')
			assert.deepEqual(errors, [])
		}
		await page.locator('a[href="#/insights"]').tap()
		await page.waitForTimeout(1500)
		const remaining = await page.evaluate(
			() =>
				window.__gpu.refs.filter((r) => {
					const gl = r.deref()
					return gl instanceof WebGL2RenderingContext && !gl.isContextLost()
				}).length,
		)
		console.log(engine, device, 'active GPU contexts after leaving Home:', remaining)
		assert.equal(remaining, 0, 'Leaving Home must release both 3D renderers (the shared font atlas uses WebGL1)')
		assert.deepEqual(warnings, [])
		assert.deepEqual(errors, [])
		await context.close()
	}
	console.log(`PASS: ${engine} mobile navigation, orientation, header, Worker Setup, GPU cleanup, and crash checks.`)
} finally {
	await browser.close()
}
