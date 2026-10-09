import assert from 'node:assert/strict'
import {readFile, mkdir} from 'node:fs/promises'
const {chromium, webkit} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const engine = process.env.BASSIN_BROWSER || 'chromium'
const browser = await (engine === 'webkit' ? webkit : chromium).launch({headless: true, ...(engine === 'chromium' ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE} : {})})
const base = process.env.BASSIN_TEST_URL || 'http://127.0.0.1:4174'
const output = '/tmp/bassin-notifications-review'
await mkdir(output, {recursive: true})
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({viewport: {width, height: width === 1440 ? 1000 : 844}})
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('dialog', dialog => dialog.accept())
    const original = {
      btcd: [{url: 'node:8332', auth: 'test', pass: 'test-only', notify: true, custom: 'keep'}, {url: 'backup:8332', auth: 'backup', pass: 'preserve', notify: false}],
      zmqblock: 'tcp://node:28332', blockpoll: 250, startdiff: 42,
      ipcmining: '/custom/mining.sock', extra: {retained: true},
    }
    await page.goto(base + '/#/settings?tab=node')
    await page.locator('input[type=file]').setInputFiles({name: 'ckpool.conf', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(original))})
    await page.getByRole('heading', {name: 'Bitcoin Core connection'}).waitFor()
    assert.equal(await page.getByText('btcd[0].pass', {exact: true}).count(), 0)
    const toggle = page.getByRole('switch', {name: 'Poll for new blocks'})
    assert.equal(await toggle.getAttribute('aria-checked'), 'false')
    await page.getByText('Polling is disabled for this node in this file.', {exact: false}).waitFor()
    await toggle.click()
    assert.equal(await toggle.getAttribute('aria-checked'), 'true')
    const zmq = page.getByRole('textbox', {name: 'ZMQ Block Endpoint'})
    assert.equal(await zmq.inputValue(), original.zmqblock)
    await zmq.fill('tcp://node:65536')
    assert.equal(await zmq.getAttribute('aria-invalid'), 'true')
    await page.locator('#zmq-error').waitFor()
    assert.equal(await page.getByRole('button', {name: 'Download config'}).isEnabled(), false)
    await zmq.fill('tcp://[2001:db8::1]:28332')
    assert.equal(await zmq.getAttribute('aria-invalid'), 'false')
    await page.getByRole('spinbutton', {name: 'Block Polling Interval'}).fill('500')
    async function exported() {
      const downloading = page.waitForEvent('download')
      await page.getByRole('button', {name: 'Download config'}).click()
      return JSON.parse(await readFile(await (await downloading).path(), 'utf8'))
    }
    assert.deepEqual(await exported(), {...original, zmqblock: 'tcp://[2001:db8::1]:28332', blockpoll: 500, btcd: [{...original.btcd[0], notify: false}, original.btcd[1]]})
    await zmq.fill('')
    const withoutEndpoint = await exported()
    assert.equal(Object.hasOwn(withoutEndpoint, 'zmqblock'), false)
    assert.equal(withoutEndpoint.btcd[0].notify, false)
    await toggle.click()
    assert.equal((await exported()).btcd[0].notify, true)
    await page.getByRole('textbox', {name: 'Search settings'}).fill('notifications')
    await page.getByRole('heading', {name: 'Block notifications', exact: true}).waitFor()
    await page.getByRole('textbox', {name: 'Search settings'}).fill('RPC password')
    await page.getByRole('textbox', {name: 'RPC Username'}).waitFor()
    await page.getByRole('textbox', {name: 'Search settings'}).fill('blockpoll')
    await page.getByRole('spinbutton', {name: 'Block Polling Interval'}).waitFor()
    await page.getByRole('textbox', {name: 'Search settings'}).fill('')
    await page.getByRole('heading', {name: 'Block notifications', exact: true}).scrollIntoViewIfNeeded()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No viewport overflow')
    const card = await page.getByTestId('settings-card').boundingBox()
    for (const selector of ['#zmq', '#blockpoll', '[role=switch]']) {
      const box = await page.locator(selector).boundingBox()
      assert.ok(box.x >= card.x && box.x + box.width <= card.x + card.width, `${selector} stays within settings card`)
      assert.equal(await page.locator(selector).evaluate(el => getComputedStyle(el).color), 'rgb(255, 255, 255)')
    }
    await page.locator('#zmq').scrollIntoViewIfNeeded()
    await page.waitForTimeout(4500)
    await page.screenshot({path: `${output}/${engine}-${width}.png`})
    assert.deepEqual(errors, [])
    console.log(`PASS ${engine} ${width}px: notification controls, validation, export preservation, search, contrast, layout`)
    await context.close()
  }
} finally {
  await browser.close()
}
