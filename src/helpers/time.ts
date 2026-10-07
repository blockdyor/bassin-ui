// UI timestamps use milliseconds and ISO's UTC calendar, never the browser timezone.
export function utcIso(timestamp: number): string | undefined {
	const date = new Date(timestamp)
	return Number.isFinite(date.getTime()) ? date.toISOString() : undefined
}

export function utcDateTime(timestamp: number): string {
	const iso = utcIso(timestamp)
	return iso ? `${iso.slice(0, 19).replace('T', ' ')} UTC` : '—'
}

export function utcTime(timestamp: number, seconds = true): string {
	return utcIso(timestamp)?.slice(11, seconds ? 19 : 16) ?? '—'
}
