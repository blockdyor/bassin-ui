import assert from 'node:assert/strict'
import {readFile, mkdir} from 'node:fs/promises'
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE})
const base = process.env.BASSIN_TEST_URL || 'http://127.0.0.1:4174'
const fixture = await readFile(new URL('../src/demodata/pool/pool.status', import.meta.url), 'utf8')
const users = JSON.parse(
	await readFile(new URL('../src/demodata/users/1BitcoinEaterAddressDontSendf59kuE', import.meta.url), 'utf8'),
)
const start = Date.parse('2026-10-07T23:59:30Z')
await mkdir('/tmp/bassin-ui-fork-review', {recursive: true})
try {
	for (const [colorScheme, timezoneId] of [
		['light', 'America/Los_Angeles'],
		['dark', 'Asia/Kolkata'],
	]) {
		const context = await browser.newContext({
			viewport: {width: 1440, height: 1100},
			colorScheme,
			timezoneId,
			reducedMotion: 'reduce',
		})
		const page = await context.newPage(),
			errors = []
		page.on('pageerror', (e) => errors.push(e.message))
		await page.clock.install({time: new Date(start)})
		let stamp = start / 1000,
			version = {software: 'ckpool', version: '9.8.7'}
		await page.route('**/pool/version.json', (route) => route.fulfill({json: version}))
		await page.route('**/pool/pool.status', (route) => {
			const rows = fixture.trim().split('\n').map(JSON.parse)
			rows[0].lastupdate = stamp
			return route.fulfill({contentType: 'text/plain', body: rows.map(JSON.stringify).join('\n')})
		})
		await page.route('**/users/1BitcoinEaterAddressDontSendf59kuE', (route) =>
			route.fulfill({json: {...users, worker: users.worker.map((w) => ({...w, lastshare: start / 1000}))}}),
		)
		await page.goto(base + '/#/insights')
		await page.getByLabel('CKPool version', {exact: true}).getByText('CKPool v9.8.7', {exact: true}).waitFor()
		await page.getByText('gamma', {exact: true}).waitFor()
		const clock = page.getByLabel('Current UTC time', {exact: true})
		assert.match(await clock.textContent(), /^2026-10-07 23:59:\d{2} UTC$/)
		stamp += 60
		await page.clock.fastForward(60000)
		const chart = page.getByRole('img', {name: 'Pool hashrate history', exact: true})
		await chart.locator('.recharts-area').first().waitFor()
		assert.match(await clock.textContent(), /^2026-10-08 00:00:\d{2} UTC$/)
		assert.ok((await page.locator('.recharts-xAxis').textContent()).includes('00:00'))
		assert.ok((await page.locator('tbody').textContent()).includes('2026-10-07 23:59:30 UTC'))
		const box = await chart.boundingBox()
		await page.mouse.move(box.x + box.width - 25, box.y + 90)
		await page.clock.runFor(300)
		const tooltip = page.locator('.recharts-default-tooltip')
		await tooltip.waitFor({state: 'visible'})
		assert.ok((await tooltip.textContent()).includes('2026-10-08 00:00:30 UTC'))
		assert.equal(await tooltip.evaluate((el) => getComputedStyle(el).backgroundColor), 'rgb(18, 33, 43)')
		assert.equal(
			await tooltip.locator('.recharts-tooltip-label').evaluate((el) => getComputedStyle(el).color),
			'rgb(255, 255, 255)',
		)
		assert.equal(
			await tooltip.locator('.recharts-tooltip-item').evaluate((el) => getComputedStyle(el).color),
			'rgb(118, 217, 245)',
		)
		await page.screenshot({path: `/tmp/bassin-ui-fork-review/utc-tooltip-${colorScheme}.png`})
		// Refreshing metadata must change the version without rebuilding the frontend.
		version = {software: 'ckpool', version: '10.0.0'}
		stamp += 60
		await page.clock.fastForward(60000)
		await page.getByText('CKPool v10.0.0', {exact: true}).waitFor()
		version = null
		stamp += 60
		await page.clock.fastForward(60000)
		await page.getByText('CKPool —', {exact: true}).waitFor()
		await page.locator('a[href="#/settings"]').click()
		await page.getByRole('tab', {name: 'Logs', exact: true}).click()
		await page.getByText(/latest 64 KiB \/ 400 lines.*UTC/).waitFor()
		for (const width of [390, 320]) {
			await page.setViewportSize({width, height: 844})
			assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
		}
		assert.deepEqual(errors, [])
		await context.close()
	}
	console.log(
		'PASS: UTC clock/date rollover/chart/worker/log times in two non-UTC timezones, readable light/dark tooltips, live version changes, missing version, and mobile layout.',
	)
} finally {
	await browser.close()
}
