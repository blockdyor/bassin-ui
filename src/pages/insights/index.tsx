// Uses upstream Insights card, stat-summary grid, chart defaults, and table styling.
import {useState} from 'react'
import {Info, Search} from 'lucide-react'
import {Area, AreaChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer, Tooltip} from 'recharts'
import {CardHeader, CardTitle, CardContent} from '@/components/ui/card'
import {Input} from '@/components/ui/input'
import InfoDialog from '@/components/shared/InfoDialog'
import PoolNotice from '@/components/PoolNotice'
import {usePoolData} from '@/hooks/PoolContext'
import {age, duration, hashrate, number} from '@/helpers/display'
import {utcDateTime, utcTime, utcIso} from '@/helpers/time'
import {bestShareEver} from '@/helpers/mining'
import {parseHashrate} from '@/helpers/convert'
import InsightCard from './InsightsCard'
import {ChartCard, DEFAULT_GRID_PROPS} from './ChartDefaults'

function Stat({label, value, description}: {label: string; value: string | number; description: string}) {
	return (
		<div className='flex flex-col items-center justify-center gap-2 py-6'>
			<h3 className='flex items-center gap-1 font-outfit text-[15px] font-light text-white/30'>
				{label}
				<InfoDialog
					trigger={<Info className='w-3 h-3 text-white/30 hover:text-white/60' />}
					title={label}
					description={description}
				/>
			</h3>
			<p className='font-outfit text-[20px] font-medium leading-none bg-text-gradient bg-clip-text text-transparent'>
				{value}
			</p>
		</div>
	)
}
export default function InsightsPage() {
	const {pool, users, chart, usersError, loading, now} = usePoolData()
	const [query, setQuery] = useState('')
	const [sort, setSort] = useState('hashrate')
	const workers = users
		.flatMap((user) => user.worker.map((worker) => ({...worker, address: user.username})))
		.filter((worker) => `${worker.workername} ${worker.address}`.toLowerCase().includes(query.toLowerCase()))
		.sort((a, b) =>
			sort === 'name'
				? a.workername.localeCompare(b.workername)
				: sort === 'best'
					? b.bestshare - a.bestshare
					: parseHashrate(b.hashrate5m) - parseHashrate(a.hashrate5m),
		)
	return (
		<div className='flex flex-col gap-10 pb-26'>
			<PoolNotice />
			<div className='flex justify-end -mb-6 text-xs text-white/70 tabular-nums'>
				<time aria-label='Current UTC time' dateTime={utcIso(now)}>
					{utcDateTime(now)}
				</time>
			</div>
			<InsightCard className='p-0 overflow-hidden h-[240px] md:h-[120px]'>
				<div className='h-full grid grid-cols-2 md:grid-cols-4 [&>*:nth-child(4n+2)]:bg-white/5 [&>*:nth-child(4n+3)]:bg-white/5 md:[&>*:nth-child(odd)]:bg-transparent md:[&>*:nth-child(even)]:bg-white/5'>
					<Stat
						label='Workers'
						value={pool?.Workers ?? '—'}
						description='Worker count reported by your pool. The worker table can retain older workers after they disconnect.'
					/>
					<Stat
						label='Round Best Share'
						value={number(pool?.bestshare)}
						description='Highest share difficulty since the pool last found a block or its share counters were explicitly reset. Saved across pool restarts; this is not a session record.'
					/>
					<Stat
						label='Best Share Ever'
						value={number(bestShareEver(users))}
						description={
							'Highest best-ever difficulty across saved miner records. It survives restarts while those records are kept; deleted records can remove history.' +
							(usersError ? ' Showing the last received records.' : '')
						}
					/>
					<Stat
						label='Pool Uptime'
						value={pool ? duration(pool.runtime) : '—'}
						description='Time since your pool started.'
					/>
				</div>
			</InsightCard>
			<ChartCard
				title='Pool Hashrate'
				legend={<span className='text-[12px] text-white/70'>5-minute average · UTC</span>}
			>
				{chart.length < 2 ? (
					<div className='flex flex-col items-center justify-center w-full aspect-video text-white/40 px-6 text-center text-sm gap-3'>
						<span>Collecting hashrate history</span>
						<span className='text-xs'>Samples accumulate during this visit as your pool updates.</span>
					</div>
				) : (
					<div className='h-[260px] sm:h-[330px] w-full' role='img' aria-label='Pool hashrate history'>
						<ResponsiveContainer width='100%' height='100%'>
							<AreaChart data={chart} margin={{top: 15, right: 20, bottom: 15, left: 5}}>
								<defs>
									<linearGradient id='hashrate-fill' x1='0' x2='0' y1='0' y2='1'>
										<stop stopColor='#53cbea' stopOpacity={0.28} />
										<stop offset='1' stopColor='#53cbea' stopOpacity={0} />
									</linearGradient>
								</defs>
								<CartesianGrid {...DEFAULT_GRID_PROPS} />
								<XAxis
									dataKey='time'
									tickFormatter={(v) => utcTime(Number(v) * 1000, false)}
									stroke='#9fb2be'
									fontSize={11}
									axisLine={false}
									tickLine={false}
								/>
								<YAxis
									tickFormatter={(v) => number(v)}
									stroke='#9fb2be'
									fontSize={11}
									axisLine={false}
									tickLine={false}
								/>
								<Tooltip
									contentStyle={{
										background: '#12212b',
										color: '#ffffff',
										border: '1px solid #6d899b',
										borderRadius: 8,
										fontSize: 12,
									}}
									labelStyle={{color: '#ffffff'}}
									itemStyle={{color: '#76d9f5'}}
									labelFormatter={(v) => utcDateTime(Number(v) * 1000)}
									formatter={(v) => [`${number(Number(v))}H/s`, 'Hashrate']}
								/>
								<Area dataKey='value' stroke='#53cbea' fill='url(#hashrate-fill)' isAnimationActive={false} />
							</AreaChart>
						</ResponsiveContainer>
					</div>
				)}
			</ChartCard>
			<InsightCard>
				<CardHeader>
					<CardTitle className='font-outfit text-white text-[20px] font-normal pt-2'>Shares</CardTitle>
				</CardHeader>
				<CardContent>
					<div className='grid grid-cols-2 md:grid-cols-4 gap-6 text-[13px]'>
						{[
							['Accepted difficulty', number(pool?.accepted)],
							['Rejected difficulty', number(pool?.rejected)],
							['Mining addresses', pool?.Users ?? '—'],
							['Updated', pool ? utcDateTime(pool.lastupdate * 1000) : '—'],
							['Share rate · 1 minute', pool ? `${pool.SPS1m.toFixed(3)} /s` : '—'],
						].map(([label, value]) => (
							<div key={label}>
								<div className='text-white/40 mb-2'>{label}</div>
								<div
									className={`text-white/85 font-outfit ${label === 'Updated' ? 'text-sm tabular-nums' : 'text-lg'}`}
								>
									{value}
								</div>
							</div>
						))}
					</div>
				</CardContent>
			</InsightCard>
			<InsightCard>
				<CardHeader className='flex flex-row items-center justify-between gap-4 flex-wrap'>
					<CardTitle className='font-outfit text-white text-[20px] font-normal pt-2'>Workers</CardTitle>
					<div className='flex items-center gap-3'>
						<div className='relative max-w-[200px]'>
							<Search className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60' />
							<Input
								className='pl-9 bassin-field border-none text-white text-xs'
								aria-label='Search workers or addresses'
								placeholder='Search workers'
								value={query}
								onChange={(e) => setQuery(e.target.value)}
							/>
						</div>
						<select
							aria-label='Sort workers'
							className='rounded bg-[#202c34] px-2 py-2 text-xs text-white/70 max-w-[120px]'
							value={sort}
							onChange={(e) => setSort(e.target.value)}
						>
							<option value='hashrate'>Hashrate</option>
							<option value='best'>Round best</option>
							<option value='name'>Name</option>
						</select>
					</div>
				</CardHeader>
				<CardContent>
					{usersError && (
						<p role='status' className='mb-4 text-xs text-amber-200'>
							Worker data could not be refreshed.{' '}
							{users.length ? 'Showing the last received workers.' : 'Check the pool’s users directory.'}
						</p>
					)}
					{loading ? (
						<p className='text-sm text-white/50 py-10 text-center'>Loading workers…</p>
					) : !workers.length ? (
						<p className='text-sm text-white/50 py-10 text-center'>
							{query
								? 'No workers match your search.'
								: usersError
									? 'Worker data unavailable.'
									: 'No workers yet. Use Connect to set up your miner.'}
						</p>
					) : (
						<div className='overflow-x-auto'>
							<table className='w-full text-left text-[12px] whitespace-nowrap'>
								<thead className='text-white/40 border-b border-white/10'>
									<tr>
										{[
											'Worker',
											'Hashrate · 5m',
											'1h / 24h / 7d',
											'Best · round / all-time',
											'Shares',
											'Last share',
										].map((label) => (
											<th className='font-normal px-3 py-3 first:pl-0' key={label}>
												{label}
											</th>
										))}
									</tr>
								</thead>
								<tbody>
									{workers.map((worker) => (
										<tr
											key={`${worker.address}/${worker.workername}`}
											className='border-b border-white/6 last:border-none text-white/75'
										>
											<th scope='row' className='font-normal py-4 pr-3'>
												<span className='block max-w-40 truncate' title={worker.workername}>
													{worker.workername.includes('.')
														? worker.workername.slice(worker.workername.indexOf('.') + 1)
														: worker.workername}
												</span>
												<span className='block text-[10px] text-white/30 max-w-32 truncate' title={worker.address}>
													{worker.address}
												</span>
											</th>
											<td className='px-3 text-[#76d9f5]'>{hashrate(worker.hashrate5m)}</td>
											<td className='px-3'>
												{hashrate(worker.hashrate1hr)}
												<small className='block text-white/35'>
													{hashrate(worker.hashrate1d)} / {hashrate(worker.hashrate7d)}
												</small>
											</td>
											<td className='px-3'>
												{number(worker.bestshare)}
												<small className='block text-white/35'>{number(worker.bestever)}</small>
											</td>
											<td className='px-3'>{number(worker.shares)}</td>
											<td className='px-3'>
												{worker.lastshare ? (
													<>
														<time dateTime={utcIso(worker.lastshare * 1000)}>
															{utcDateTime(worker.lastshare * 1000)}
														</time>
														<small className='block text-white/60'>{age(worker.lastshare, now)}</small>
													</>
												) : (
													'Never'
												)}
											</td>
										</tr>
									))}
								</tbody>
							</table>
						</div>
					)}
				</CardContent>
			</InsightCard>
		</div>
	)
}
