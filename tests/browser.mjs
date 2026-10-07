import assert from 'node:assert/strict'
import {readFile, mkdir} from 'node:fs/promises'
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const base = process.env.BASSIN_TEST_URL || 'http://127.0.0.1:4174'
const output = '/tmp/bassin-ui-fork-review'
await mkdir(output, {recursive: true})
const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE})
const context = await browser.newContext({viewport: {width: 1440, height: 1000}})
const page = await context.newPage()
page.setDefaultTimeout(20000)
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
page.on('console', (message) => {
	if (message.type() === 'error' && !message.text().includes('net::ERR'))
		console.log('Console:', message.text().slice(0, 240))
})
async function nav(name) {
	await page.locator(`a[href="#/${name === 'Home' ? '' : name.toLowerCase()}"]`).click({noWaitAfter: true})
	await page.waitForURL(`**/#/${name === 'Home' ? '' : name.toLowerCase()}`)
	await page.waitForTimeout(name === 'Home' ? 1500 : 250)
}
async function noOverflow() {
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'viewport must not overflow')
}
try {
	await page.goto(base)
	await page.getByRole('heading', {name: 'Bassin', exact: true}).waitFor()
	await page.getByText('Running', {exact: true}).waitFor()
	await page.locator('header').getByText('2.1.7', {exact: true}).first().waitFor()
	await page.waitForTimeout(8000)
	const geometry = await page.locator('[data-testid=home-hero]').boundingBox()
	assert.equal(Math.round(geometry.width), 768)
	assert.equal(Math.round(geometry.y), 116)
	assert.ok(Math.abs(geometry.height - 407) < 3)
	assert.equal(await page.locator('a[role=tab]').count(), 3)
	assert.ok((await page.evaluate(() => getComputedStyle(document.body).fontFamily)).includes('DM Sans'))
	await noOverflow()

	await page.screenshot({path: `${output}/home-desktop.png`})
	if (process.argv.includes('--visual')) {
		await nav('Settings')
		await page.screenshot({path: `${output}/settings-desktop.png`})
		await nav('Insights')
		await page.screenshot({path: `${output}/insights-desktop.png`})
		assert.deepEqual(errors, [])
		console.log('PASS: source-based shell geometry and visual captures.')
		process.exitCode = 0
	} else {
		await page.getByRole('button', {name: 'Connect', exact: true}).click()
		await page.getByRole('dialog').waitFor()
		await page.getByText('Connect to Bassin', {exact: true}).waitFor()
		await page.getByRole('tab', {name: 'Worker Setup', exact: true}).click()
		await page.getByText('<bitcoin-address>.<worker-name>', {exact: true}).waitFor()
		await page.keyboard.press('Escape')
		await nav('Insights')
		await page.getByRole('heading', {name: 'Best Share Ever', exact: true}).waitFor()
		await page.getByRole('heading', {name: 'Round Best Share', exact: true}).waitFor()
		assert.equal(await page.getByRole('heading', {name: 'Best Share', exact: true}).count(), 0)
		await page.getByText('gamma', {exact: true}).waitFor()
		await page.getByRole('textbox', {name: 'Search workers or addresses'}).fill('gamma')
		assert.equal(await page.locator('tbody tr').count(), 1)
		await page.getByRole('textbox', {name: 'Search workers or addresses'}).fill('not-here')
		await page.getByText('No workers match your search.').waitFor()
		await page.getByRole('textbox', {name: 'Search workers or addresses'}).fill('')
		await page.screenshot({path: `${output}/insights-desktop.png`})
		await nav('Settings')
		await page.screenshot({path: `${output}/settings-desktop.png`})
		assert.equal(
			await page.getByRole('link', {name: 'Bassin on GitHub'}).getAttribute('href'),
			'https://github.com/blockdyor/bassin',
		)
		assert.equal(await page.getByRole('button', {name: 'Download config'}).isEnabled(), false)
		const imported = {
			btcd: [
				{url: 'node:8332', auth: 'test', pass: 'test-only', notify: true},
				{url: 'backup:8332', auth: 'backup', pass: 'preserve'},
			],
			mindiff: 1,
			startdiff: 42,
			maxdiff: 0,
			btcsig: '/Bassin/',
			logdir: '/www',
			custom: {keep: true},
		}
		await page
			.locator('input[type=file]')
			.setInputFiles({name: 'ckpool.conf', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(imported))})
		await page.getByRole('spinbutton', {name: 'Starting Difficulty'}).fill('256')
		await page.getByRole('spinbutton', {name: 'Maximum Difficulty'}).fill('5')
		assert.equal(await page.getByRole('button', {name: 'Download config'}).isEnabled(), false)
		await page.getByRole('spinbutton', {name: 'Maximum Difficulty'}).fill('0')
		await nav('Home')
		await nav('Settings')
		assert.equal(await page.getByRole('spinbutton', {name: 'Starting Difficulty'}).inputValue(), '256')
		const downloading = page.waitForEvent('download')
		await page.getByRole('button', {name: 'Download config'}).click()
		const download = await downloading
		const downloaded = JSON.parse(await readFile(await download.path(), 'utf8'))
		assert.equal(downloaded.startdiff, 256)
		assert.deepEqual(downloaded.btcd, imported.btcd)
		assert.deepEqual(downloaded.custom, imported.custom)
		await page.getByRole('textbox', {name: 'Search settings'}).fill('blockpoll')
		await page.getByRole('spinbutton', {name: 'Block Polling Interval'}).waitFor()
		await page.getByRole('textbox', {name: 'Search settings'}).fill('')
		await page.getByRole('tab', {name: 'Bitcoin Node', exact: true}).click()
		for (const selector of [
			'label[for="node-url"]',
			'label[for="node-auth"]',
			'label[for="node-pass"]',
			'label[for="zmq"]',
		]) {
			assert.equal(
				await page.locator(selector).evaluate((el) => getComputedStyle(el).color),
				'rgb(255, 255, 255)',
				'Node labels must remain readable on the dark card',
			)
		}
		assert.equal(
			await page.getByText('Block Notifications', {exact: true}).evaluate((el) => getComputedStyle(el).color),
			'rgb(255, 255, 255)',
		)
		assert.equal(
			await page
				.getByRole('textbox', {name: 'RPC Host and Port', exact: true})
				.evaluate((el) => getComputedStyle(el).color),
			'rgb(255, 255, 255)',
		)
		await page.screenshot({path: `${output}/bitcoin-node-settings.png`})
		await page.getByRole('tab', {name: 'Advanced', exact: true}).click()
		await page.getByRole('textbox', {name: 'Pool configuration JSON'}).fill('{broken')
		assert.equal(await page.getByRole('button', {name: 'Download config'}).isEnabled(), false)
		await page.getByRole('textbox', {name: 'Pool configuration JSON'}).fill(JSON.stringify(downloaded, null, 2))
		await page.getByRole('tab', {name: 'Logs', exact: true}).click()
		await page.getByText('Accepted share from gamma', {exact: false}).first().waitFor()
		await page.getByRole('textbox', {name: 'Search log output'}).fill('WARNING')
		assert.equal(await page.locator('.log-line').count(), 1)
		await page.getByRole('textbox', {name: 'Search log output'}).fill('')
		await page.getByRole('button', {name: 'Pause', exact: true}).click()
		await page.getByRole('button', {name: 'Resume', exact: true}).waitFor()
		await page.screenshot({path: `${output}/logs-desktop.png`})
		for (const width of [390, 320]) {
			await page.setViewportSize({width, height: 844})
			for (const name of ['Home', 'Insights', 'Settings']) {
				await nav(name)
				await noOverflow()
				if (width === 390) await page.screenshot({path: `${output}/${name.toLowerCase()}-mobile.png`})
			}
		}
		// A separate page avoids the config editor’s beforeunload guard affecting this check.
		await page.close()
		const statusPage = await context.newPage()
		statusPage.on('pageerror', (error) => errors.push(error.message))
		await statusPage.route('**/pool/pool.status', (route) => route.fulfill({status: 503, body: 'unavailable'}))
		await statusPage.goto(base + '/#/')
		await statusPage.getByText('Pool status unavailable.', {exact: false}).waitFor()
		assert.equal(await statusPage.getByText('Running', {exact: true}).count(), 0)
		assert.equal(await statusPage.locator('a[role=tab]').count(), 3)
		const fixture = await readFile(new URL('../src/demodata/pool/pool.status', import.meta.url), 'utf8')
		await statusPage.unroute('**/pool/pool.status')
		await statusPage.route('**/pool/pool.status', (route) => route.fulfill({contentType: 'text/plain', body: fixture}))
		await statusPage.getByRole('button', {name: 'Retry', exact: true}).click()
		await statusPage.getByText('The pool’s status file is out of date.', {exact: false}).waitFor()
		assert.equal(await statusPage.getByText('Running', {exact: true}).count(), 0)
		assert.deepEqual(errors, [])
		console.log(
			'PASS: upstream geometry/fonts/dock, connection dialog, workers, configuration validation/preservation/export, logs, 390px/320px layouts, error and stale states.',
		)
	}
	console.log(`Screenshots: ${output}`)
} finally {
	await browser.close()
}
