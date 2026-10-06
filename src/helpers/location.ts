export interface PoolLocation {
	source: 'bitcoin-node'
	ip: string
	latitude: number
	longitude: number
	updatedAt: number
}
export function parsePoolLocation(value: unknown, now = Date.now()): PoolLocation | null {
	if (!value || typeof value !== 'object') return null
	const data = value as Record<string, unknown>
	if (data.source !== 'bitcoin-node') return null
	if (typeof data.ip !== 'string' || !data.ip || data.ip.length > 45) return null
	if (typeof data.latitude !== 'number' || !Number.isFinite(data.latitude) || Math.abs(data.latitude) > 90) return null
	if (typeof data.longitude !== 'number' || !Number.isFinite(data.longitude) || Math.abs(data.longitude) > 180)
		return null
	if (
		typeof data.updatedAt !== 'number' ||
		!Number.isFinite(data.updatedAt) ||
		data.updatedAt > now + 60000 ||
		now - data.updatedAt > 48 * 3600000
	)
		return null
	return {
		source: 'bitcoin-node',
		ip: data.ip,
		latitude: data.latitude,
		longitude: data.longitude,
		updatedAt: data.updatedAt,
	}
}
