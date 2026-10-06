// CKPool adapter for the upstream scrollable log panel and controls.
import {useEffect, useRef, useState} from 'react'
import {Download, Search} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Checkbox} from '@/components/ui/checkbox'
import FadeScrollArea from '@/components/shared/FadeScrollArea'
import {fetchLog, logLevel} from '@/helpers/logs'
import {download} from '@/helpers/display'
export default function CKPoolLog() {
	const [text, setText] = useState(''),
		[error, setError] = useState(''),
		[query, setQuery] = useState('')
	const [paused, setPaused] = useState(false),
		[follow, setFollow] = useState(true),
		[errorsOnly, setErrorsOnly] = useState(false),
		[loading, setLoading] = useState(true)
	const [attempt, setAttempt] = useState(0),
		[updated, setUpdated] = useState<Date | null>(null)
	const viewport = useRef<HTMLDivElement | null>(null)
	useEffect(() => {
		if (paused) return
		const controller = new AbortController()
		let timer: ReturnType<typeof setTimeout>
		async function poll() {
			try {
				const result = await fetchLog(controller.signal)
				if (!controller.signal.aborted) {
					setText(result)
					setError('')
					setUpdated(new Date())
				}
			} catch (e) {
				if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Unable to read the pool log.')
			} finally {
				if (!controller.signal.aborted) {
					setLoading(false)
					timer = setTimeout(poll, 5000)
				}
			}
		}
		void poll()
		return () => {
			controller.abort()
			clearTimeout(timer)
		}
	}, [paused, attempt])
	useEffect(() => {
		if (follow && viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight
	}, [text, follow, query, errorsOnly])
	const lines = text
		.split('\n')
		.filter(
			(line) => line && line.toLowerCase().includes(query.toLowerCase()) && (!errorsOnly || logLevel(line) === 'error'),
		)
	return (
		<div className='space-y-4'>
			<div className='flex flex-wrap gap-3 justify-between items-center'>
				<p className='text-[13px] text-white/60'>
					Pool log{' '}
					<span className='text-[#76d9f5]'>
						{paused ? '· Paused' : error ? '· Unavailable' : loading ? '· Connecting' : '· Following'}
					</span>
				</p>
				<Button size='sm' onClick={() => setPaused(!paused)}>
					{paused ? 'Resume' : 'Pause'}
				</Button>
			</div>
			<div className='relative'>
				<Search className='absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/60' />
				<Input
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					aria-label='Search log output'
					placeholder='Search log output'
					className='bassin-field pl-9 border-none text-white'
				/>
			</div>
			{error && (
				<div role='status' className='text-xs text-amber-200 bg-amber-400/10 rounded-lg p-3'>
					<p>{error} Check that Bassin writes to /www/ckpool.log and the file server allows reading it.</p>
					<Button
						className='mt-2'
						size='sm'
						onClick={() => {
							setPaused(false)
							setAttempt((v) => v + 1)
						}}
					>
						Retry log
					</Button>
				</div>
			)}
			<FadeScrollArea
				viewportRef={viewport}
				className='h-64 rounded bg-black/40 font-mono text-xs [--fade-top:#081018] [--fade-bottom:#081018]'
			>
				<div className='p-3 pr-4' role='region' aria-label='Pool log output'>
					{lines.length ? (
						lines.map((line, i) => (
							<div
								key={i}
								className={`log-line whitespace-pre-wrap break-all leading-6 ${logLevel(line) === 'error' ? 'text-red-300' : logLevel(line) === 'warning' ? 'text-amber-200' : 'text-white/70'}`}
							>
								{line}
							</div>
						))
					) : (
						<p className='text-white/40 py-10 text-center'>
							{loading
								? 'Reading pool log…'
								: error
									? 'No log output available.'
									: text
										? 'No lines match your filters.'
										: 'The log is empty.'}
						</p>
					)}
				</div>
			</FadeScrollArea>
			<div className='flex flex-wrap justify-between gap-4'>
				<label className='flex items-center gap-2 text-xs text-white/70'>
					<Checkbox checked={errorsOnly} onCheckedChange={(v) => setErrorsOnly(v === true)} />
					Show errors only
				</label>
				<label className='flex items-center gap-2 text-xs text-white/70'>
					<Checkbox checked={follow} onCheckedChange={(v) => setFollow(v === true)} />
					Follow output
				</label>
			</div>
			<div className='flex flex-wrap items-center justify-between gap-3'>
				<span className='text-[11px] text-white/40'>
					{lines.length} lines · latest 64 KiB / 400 lines{updated ? ` · ${updated.toLocaleTimeString()}` : ''}
				</span>
				<Button size='sm' disabled={!lines.length} onClick={() => download(lines.join('\n'), 'bassin-ckpool.log')}>
					<Download />
					Download log
				</Button>
			</div>
		</div>
	)
}
