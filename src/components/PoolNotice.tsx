import {usePoolData} from '@/hooks/PoolContext'
export default function PoolNotice() {
	const {error, stale, pool, refresh} = usePoolData()
	if (!error && !stale) return null
	return (
		<div role='status' className='mb-4 rounded-lg bg-amber-400/10 px-4 py-3 text-[12px] text-amber-200'>
			{error ? (
				<>
					Pool status unavailable. {pool ? 'Showing the last received data.' : 'Check Bassin and your Bitcoin node.'}{' '}
					<button className='underline ml-2' onClick={refresh}>
						Retry
					</button>
				</>
			) : (
				'The pool’s status file is out of date. Showing the last reported statistics.'
			)}
		</div>
	)
}
