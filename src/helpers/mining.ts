import type {User} from '../interfaces/users'

// These are persisted miner records, not a browser-local high-water mark.
export function bestShareEver(users: User[]): number | undefined {
	let best: number | undefined
	for (const user of users) {
		for (const value of [user.bestever, ...user.worker.map((worker) => worker.bestever)]) {
			if (typeof value === 'number' && Number.isFinite(value) && value >= 0) best = Math.max(best ?? 0, value)
		}
	}
	return best
}
