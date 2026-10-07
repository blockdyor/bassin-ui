export function parsePoolVersion(value: unknown): string | null {
	if (!value || typeof value !== 'object') return null
	const data = value as Record<string, unknown>
	return data.software === 'ckpool' &&
		typeof data.version === 'string' &&
		/^\d+(?:\.\d+){1,3}(?:[+-][0-9A-Za-z.-]+)?$/.test(data.version) &&
		data.version.length <= 64
		? data.version
		: null
}
