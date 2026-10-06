import {mkdir} from 'node:fs/promises'
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const browser = await chromium.launch({headless: true})
const page = await browser.newPage({viewport: {width: 1440, height: 1000}})
page.setDefaultTimeout(25000)
let settingsDefaults = {version: 'latest', chain: 'main', prune: 0, maxconnections: 125, maxmempool: 300}
page.on('pageerror', (e) => console.log('Reference runtime:', e.message))
const now = Math.floor(Date.now() / 1000)
const blocks = Array.from({length: 200}, (_, i) => ({
	hash: String(i),
	height: 916100 + i,
	time: now - (199 - i) * 600,
	size: 1350000,
	weight: 3990000,
	txCount: 2850,
	subsidySat: 312500000,
	feesSat: 2400000,
	feeRates: {p10: 2, p50: 4, p90: 9},
	transactionGrid: [
		{size: 5, numberOfBlocks: 10},
		{size: 3, numberOfBlocks: 24},
		{size: 1, numberOfBlocks: 220},
	],
}))
await page.route('**/api/**', (route) => {
	const p = new URL(route.request().url()).pathname
	let data = {}
	if (p === '/api/bitcoind/version') data = {implementation: 'Bitcoin Core', version: 'v29.1'}
	if (p === '/api/bitcoind/status') data = {running: true, startedAt: Date.now() - 89405000}
	if (p === '/api/rpc/sync')
		data = {syncProgress: 1, isInitialBlockDownload: false, blockHeight: 916299, validatedHeaderHeight: 916299}
	if (p === '/api/rpc/peers/count')
		data = {total: 12, byNetwork: {ipv4: {total: 7}, onion: {total: 4}, i2p: {total: 1}}}
	if (p === '/api/rpc/peers/locations')
		data = {
			userLocation: [43.77, 11.25],
			peers: [
				{location: [40.7, -74], network: 'ipv4'},
				{location: [51.5, -0.1], network: 'ipv4'},
				{location: [35.7, 139.7], network: 'ipv4'},
			],
		}
	if (p === '/api/rpc/peers/info') data = []
	if (p === '/api/rpc/stats') data = {peers: 12, mempoolBytes: 3423000, chainBytes: 785000000000, uptimeSec: 89405}
	if (p === '/api/rpc/blocks')
		data = blocks.slice(-Number(new URL(route.request().url()).searchParams.get('limit') || 200))
	if (p === '/api/config/settings') data = settingsDefaults
	if (p === '/api/bitcoind/exit' || p === '/api/bitcoind/exit-info') data = null
	return route.fulfill({json: data})
})
await page.routeWebSocket('**/api/**', (ws) => ws.close())
await mkdir('/tmp/bassin-ui-reference', {recursive: true})
try {
	await page.goto('http://127.0.0.1:4180')
	await page.getByText('Bitcoin Node', {exact: true}).first().waitFor()
	await page.waitForTimeout(8000)
	await page.screenshot({path: '/tmp/bassin-ui-reference/home.png'})
	settingsDefaults = await page.evaluate(async () => {
		const m = await import('/@fs/tmp/bassin-umbrel-reference/libs/settings/index.ts')
		return m.DefaultValuesForVersion(m.resolveVersion('latest'))
	})
	await page.goto('http://127.0.0.1:4180/settings')
	await page.waitForTimeout(1500)
	await page.screenshot({path: '/tmp/bassin-ui-reference/settings.png'})
	await page.goto('http://127.0.0.1:4180/insights')
	await page.waitForTimeout(1500)
	await page.screenshot({path: '/tmp/bassin-ui-reference/insights.png'})
	console.log('Rendered upstream reference screenshots.')
} finally {
	await browser.close()
}
