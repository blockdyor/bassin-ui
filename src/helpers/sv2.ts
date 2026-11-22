export interface PoolSv2Info {
	enabled: boolean
	jdEnabled: boolean
	sv2Urls: string[]
	sv2JdUrls: string[]
	authorityPubkey: string | null
	ephemeralKeys: boolean
}

const BASE58_PUBKEY_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,80}$/

function parseUrlList(value: unknown): string[] | null {
	if (!Array.isArray(value) || value.length > 32) return null
	const urls: string[] = []
	for (const item of value) {
		if (typeof item !== 'string' || !item.trim() || item.length > 256) return null
		urls.push(item.trim())
	}
	return urls
}

export function parsePoolSv2(value: unknown): PoolSv2Info | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null
	const data = value as Record<string, unknown>
	if (typeof data.enabled !== 'boolean' || typeof data.jdEnabled !== 'boolean') return null
	const sv2Urls = parseUrlList(data.sv2Urls ?? [])
	const sv2JdUrls = parseUrlList(data.sv2JdUrls ?? [])
	if (!sv2Urls || !sv2JdUrls) return null
	let authorityPubkey: string | null = null
	if (data.authorityPubkey !== null && data.authorityPubkey !== undefined) {
		if (typeof data.authorityPubkey !== 'string' || !BASE58_PUBKEY_PATTERN.test(data.authorityPubkey)) return null
		authorityPubkey = data.authorityPubkey
	}
	return {
		enabled: data.enabled,
		jdEnabled: data.jdEnabled,
		sv2Urls,
		sv2JdUrls,
		authorityPubkey,
		ephemeralKeys: data.ephemeralKeys === true,
	}
}

export function formatSv2Url(host: string, port: number, authorityPubkey?: string | null): string {
	return `stratum2+tcp://${host}:${port}/${authorityPubkey || '<authority-pubkey>'}`
}
