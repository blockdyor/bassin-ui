import assert from 'node:assert/strict'
import {readFile, mkdir} from 'node:fs/promises'
const {chromium, webkit} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const engine = process.env.BASSIN_BROWSER || 'chromium'
const browser = await (engine === 'webkit' ? webkit : chromium).launch({
	headless: true,
	...(engine === 'chromium' ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {}),
})
const base = process.env.BASSIN_TEST_URL || 'http://127.0.0.1:4174'
const output = '/tmp/bassin-hashrate-review'
await mkdir(output, {recursive: true})
const fixture = (await readFile(new URL('../src/demodata/pool/pool.status', import.meta.url), 'utf8')).trim().split('\n').map(JSON.parse)
const keys = ['hashrate1m', 'hashrate5m', 'hashrate1hr', 'hashrate1d', 'hashrate7d']
try {
	for (const width of [1440, 390, 320]) {
		const context = await browser.newContext({viewport: {width, height: 1000}, hasTouch: width < 500, isMobile: width < 500})
		const page = await context.newPage()
		page.setDefaultTimeout(20000)
		const errors = []
		page.on('pageerror', (error) => errors.push(error.message))
		page.on('crash', () => errors.push('Page crashed'))
		let rates = ['2T', '1000G', '500G', '250G', '0']
		let unavailable = false
		await page.route('**/pool/pool.status', (route) => {
			if (unavailable) return route.fulfill({status: 503, body: 'Unavailable'})
			const rows = structuredClone(fixture)
			rows[0].lastupdate = Math.floor(Date.now() / 1000)
			for (const [index, key] of keys.entries()) rows[1][key] = rates[index]
			return route.fulfill({body: rows.map(JSON.stringify).join('\n')})
		})
		await page.route('**/pool/location.json', (route) => route.fulfill({json: null}))
		await page.route('**/pool/version.json', (route) => route.fulfill({json: {software: 'ckpool', version: '1.2.0'}}))
		await page.route(/\/users\/(?:users\.status)?$/, (route) => route.fulfill({body: ''}))
		await page.goto(base)
		const section = page.getByRole('region', {name: 'Hashrate averages'})
		await section.scrollIntoViewIfNeeded()
		await page.getByText('Shared scale · 0–3 TH/s').waitFor()
		const heights = await page.locator('.hashrate-water').evaluateAll((nodes) => nodes.map((node) => parseFloat(node.style.height)))
		for (const [index, rate] of [2, 1, 0.5, 0.25, 0].entries()) {
			assert.ok(Math.abs(heights[index] - rate / 3 * 100) < 0.001, 'Water levels must share a zero-based scale')
		}
		assert.equal(await section.locator('canvas').count(), 0, 'Water must not allocate another GPU canvas')
		assert.equal(await page.locator('.hashrate-water').last().evaluate((el) => el.style.opacity), '0', 'Zero must have no water')
		await page.waitForFunction(() => document.querySelector('.hashrate-averages')?.dataset.paused === 'false')
		const wave = section.locator('.hashrate-wave-front').nth(1)
		const initialTransform = await wave.evaluate((el) => getComputedStyle(el).transform)
		await page.waitForTimeout(350)
		assert.notEqual(await wave.evaluate((el) => getComputedStyle(el).transform), initialTransform, 'Water must animate')
		const column = section.locator('.hashrate-column').nth(1)
		const bounds = await column.boundingBox()
		if (width === 1440) {
			await page.mouse.move(bounds.x + bounds.width - 4, bounds.y + 20)
			assert.notEqual(await column.evaluate((el) => el.style.getPropertyValue('--tilt-y')), '', 'Mouse must tilt the column')
			await page.mouse.move(0, 0)
			assert.equal(await column.evaluate((el) => el.style.getPropertyValue('--tilt-y')), '', 'Leaving must reset the tilt')
		} else {
			await column.tap()
			assert.equal(await column.evaluate((el) => el.style.getPropertyValue('--tilt-y')), '', 'Touch must not leave a stuck tilt')
		}
		await page.waitForTimeout(1300)
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal page overflow')
		for (const label of await section.locator('dt, .hashrate-value').all()) {
			assert.ok(await label.evaluate((el) => el.scrollWidth <= el.clientWidth), 'Labels must fit at every width')
		}
		await page.screenshot({path: `${output}/${engine}-${width}.png`, fullPage: true})
		await page.emulateMedia({reducedMotion: 'reduce'})
		await page.waitForFunction(() => getComputedStyle(document.querySelector('.hashrate-wave')).animationName === 'none')
		assert.equal(await column.evaluate((el) => getComputedStyle(el).transform), 'none')
		assert.equal(await section.locator('.hashrate-water').first().evaluate((el) => getComputedStyle(el).transitionDuration), '0s')
		await page.emulateMedia({reducedMotion: 'no-preference'})
		// Leaving the viewport pauses the waves, and returning resumes them.
		await section.evaluate((el) => { el.style.marginTop = '2000px' })
		await page.evaluate(() => scrollTo(0, 0))
		await page.waitForFunction(() => document.querySelector('.hashrate-averages').dataset.paused === 'true')
		assert.equal(await wave.evaluate((el) => getComputedStyle(el).animationPlayState), 'paused')
		await section.evaluate((el) => { el.style.marginTop = '' })
		await section.scrollIntoViewIfNeeded()
		await page.waitForFunction(() => document.querySelector('.hashrate-averages').dataset.paused === 'false')
		// Equal rates must have equal heights regardless of reported units.
		rates = ['1T', '1000G', '1000000M', '0', '0']
		await page.reload()
		await page.waitForFunction(() => document.querySelectorAll('.hashrate-water')[1]?.style.height === '50%')
		assert.deepEqual(await page.locator('.hashrate-water').evaluateAll((nodes) => nodes.map((node) => node.style.height)), ['50%', '50%', '50%', '0%', '0%'])
		rates = ['0', '0', '0', '0', '0']
		await page.reload()
		await page.getByText('Shared scale · all available averages are zero').waitFor()
		assert.deepEqual(await page.locator('.hashrate-water').evaluateAll((nodes) => nodes.map((node) => node.style.opacity)), ['0', '0', '0', '0', '0'])
		unavailable = true
		await page.reload()
		await page.getByText('Waiting for pool data', {exact: true}).waitFor()
		assert.deepEqual(await section.locator('.hashrate-value').allTextContents(), ['—', '—', '—', '—', '—'])
		assert.deepEqual(errors, [])
		await context.close()
		console.log(`PASS: ${engine} ${width}px — scale, units, zero/missing values, waves, pointer/touch, reduced motion, visibility, layout.`)
	}
} finally {
	await browser.close()
}
