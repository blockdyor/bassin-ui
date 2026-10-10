import {useEffect, useRef, useState, type CSSProperties, type PointerEvent} from 'react'
import {useReducedMotion} from 'framer-motion'
import {usePoolData} from '@/hooks/PoolContext'
import {parseHashrate} from '@/helpers/convert'
import {hashrate, number} from '@/helpers/display'
import './HashrateAverages.css'

const windows = [
	['hashrate1m', '1 minute', '1m'],
	['hashrate5m', '5 minutes', '5m'],
	['hashrate1hr', '1 hour', '1h'],
	['hashrate1d', '24 hours', '24h'],
	['hashrate7d', '7 days', '7d'],
] as const

export default function HashrateAverages() {
	const {pool, stale, error} = usePoolData()
	const root = useRef<HTMLElement>(null)
	const reducedMotion = useReducedMotion()
	const [visible, setVisible] = useState(false)
	const [pageVisible, setPageVisible] = useState(!document.hidden)
	useEffect(() => {
		const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
		if (root.current) observer.observe(root.current)
		const visibility = () => setPageVisible(!document.hidden)
		document.addEventListener('visibilitychange', visibility)
		return () => {
			observer.disconnect()
			document.removeEventListener('visibilitychange', visibility)
		}
	}, [])
	const values = windows.map(([key]) => {
		const raw = pool?.[key]
		const value = raw?.trim() ? parseHashrate(raw) : NaN
		return Number.isFinite(value) && value >= 0 ? value : null
	})
	const maximum = Math.max(0, ...values.map((value) => value ?? 0))
	// Shared axis ceiling with headroom for the waves, never an assumed pool capacity.
	const magnitude = maximum > 0 ? 10 ** Math.floor(Math.log10(maximum)) : 1
	const ceiling = maximum > 0 ? (Math.floor(maximum / magnitude) + 1) * magnitude : 1
	const paused = !visible || !pageVisible || !!reducedMotion || stale || error
	function resetTilt(event: PointerEvent<HTMLElement>) {
		event.currentTarget.style.removeProperty('--tilt-x')
		event.currentTarget.style.removeProperty('--tilt-y')
	}
	function followPointer(event: PointerEvent<HTMLElement>) {
		if (paused || event.pointerType !== 'mouse') return
		const rect = event.currentTarget.getBoundingClientRect()
		const x = Math.max(-1, Math.min(1, (event.clientX - rect.left) / rect.width * 2 - 1))
		const y = Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1))
		event.currentTarget.style.setProperty('--tilt-x', `${-y * 3}deg`)
		event.currentTarget.style.setProperty('--tilt-y', `${x * 4}deg`)
	}
	return (
		<section ref={root} className='hashrate-averages' aria-labelledby='hashrate-averages-title' data-paused={paused}>
			<div className='hashrate-averages-heading'>
				<h2 id='hashrate-averages-title'>Hashrate averages</h2>
				<p>
					{maximum > 0
						? `Shared scale · 0–${number(ceiling)}H/s`
						: values.every((value) => value === null) ? 'Waiting for pool data' : 'Shared scale · all available averages are zero'}
				</p>
			</div>
			<dl className='hashrate-columns'>
				{windows.map(([key, label, shortLabel], index) => (
					<div key={key} className='hashrate-column' data-highlighted={key === 'hashrate5m'}
						onPointerMove={followPointer} onPointerLeave={resetTilt} onPointerCancel={resetTilt}>
						<dt><span className='hashrate-label-full'>{label}</span><abbr className='hashrate-label-short' title={label}>{shortLabel}</abbr></dt>
						<dd className='hashrate-value'>{values[index] === null ? '—' : hashrate(pool?.[key])}</dd>
						<dd className='hashrate-tank' aria-hidden='true'>
							<div className='hashrate-water' style={{
								height: `${(values[index] ?? 0) / ceiling * 100}%`,
								opacity: values[index] !== null && values[index]! > 0 ? 1 : 0,
								'--wave-delay': `${-index * 1.7}s`,
							} as CSSProperties}>
								{['back', 'front'].map((layer) => (
									<svg key={layer} className={`hashrate-wave hashrate-wave-${layer}`} viewBox='0 0 200 12' preserveAspectRatio='none'>
										<path d='M0 6 Q25 0 50 6 T100 6 Q125 0 150 6 T200 6 V12 H0 Z' />
									</svg>
								))}
							</div>
						</dd>
					</div>
				))}
			</dl>
		</section>
	)
}
