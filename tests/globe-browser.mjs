import assert from 'node:assert/strict'
import {mkdir} from 'node:fs/promises'
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE})
const context = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce'})
const errors = [],
	external = []
let location = {source: 'bitcoin-node', ip: '8.8.8.8', latitude: 51.5, longitude: 0, updatedAt: Date.now()}
await context.route('**/pool/location.json', (route) => route.fulfill({json: location}))
context.on('request', (request) => {
	if (/ipwho|ipify|ipinfo|geoip/i.test(request.url())) external.push(request.url())
})
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(error.message))
try {
	await page.goto(process.env.BASSIN_TEST_URL || 'http://127.0.0.1:4174')
	const globe = page.getByTestId('pool-globe')
	await globe.locator('canvas').waitFor()
	await page.waitForTimeout(8000)
	assert.equal(await globe.getAttribute('data-marker-count'), '1')
	const hero = page.getByTestId('home-hero')
	await mkdir('/tmp/bassin-ui-fork-review', {recursive: true})
	await page.screenshot({path: '/tmp/bassin-ui-fork-review/globe-node-marker.png'})
	// The visible region lies within the cropped globe's frame, away from overlays.
	const box = await hero.boundingBox()
	const crop = {x: box.x + 140, y: box.y + 85, width: 210, height: 170}
	const before = await page.screenshot({clip: crop})
	await page.mouse.move(box.x + 230, box.y + 165)
	await page.mouse.down()
	await page.mouse.move(box.x + 340, box.y + 190, {steps: 5})
	await page.mouse.up()
	await page.waitForTimeout(1500)
	const after = await page.screenshot({clip: crop})
	assert.ok(!before.equals(after), 'Dragging must change the geographic map')
	await page.screenshot({path: '/tmp/bassin-ui-fork-review/globe-dragged.png'})
	for (const value of [null, {...location, source: 'visitor'}, {...location, updatedAt: 1}]) {
		location = value
		await page.reload()
		await globe.locator('canvas').waitFor()
		await page.waitForTimeout(800)
		assert.equal(await globe.getAttribute('data-marker-count'), '0')
	}
	assert.deepEqual(external, [], 'Browser must never contact IP-detection or geolocation providers')
	assert.deepEqual(errors, [])
	console.log(
		'PASS: original globe renders, rotates on drag, uses node metadata only, and hides missing/invalid/stale markers.',
	)
} finally {
	await browser.close()
}
