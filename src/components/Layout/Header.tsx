import {usePoolVersion} from '@/hooks/usePoolVersion'
import {BASSIN_VERSION} from '@/helpers/constants'
import {cn} from '@/lib/utils'

// We import SVGs as React components via `?react` (SVGR):
// This inlines the <svg>, so there's no extra HTTP request.
// It also gives us the same behaviors as normal DOM elements—easy to size, recolor, and animate.
import Logo from '@/assets/logo.svg?react'

import ConnectionDetails from '@/components/ConnectionDetails'

export default function Header({className}: {className?: string}) {
	const {data: poolVersion, isError} = usePoolVersion()
	return (
		<header className={cn('flex items-end md:items-center justify-between mb-6 md:mb-8 w-full', className)}>
			<div className='flex flex-row items-center gap-2.5 md:gap-3.5 min-w-0'>
				<Logo
					aria-label='Bassin logo'
					className='w-[50px] md:w-[60px] h-[50px] md:h-[60px] shrink-0 rounded-[10px] md:rounded-[12px] overflow-hidden'
				/>
				<div className='min-w-0'>
					<h1 className='font-outfit text-[22px] md:text-[28px] font-[400] bg-text-gradient bg-clip-text text-transparent leading-none pb-1'>
						Bassin
					</h1>

					{/* We gracefully handle loading and error states for no layout shift */}
					<p className='flex flex-wrap gap-x-2 gap-y-1 text-[12px] md:text-[14px] leading-tight font-[400] text-white/60'>
						<span>{BASSIN_VERSION}</span>
						<span
							aria-label='CKPool version'
							title={
								poolVersion && !isError ? 'Version detected from the installed pool binary' : 'Pool version unavailable'
							}
						>
							· CKPool {isError ? '—' : (poolVersion ?? '—')}
						</span>
					</p>
				</div>
			</div>
			<div>
				{/* Connect button + modal */}
				<ConnectionDetails />
			</div>
		</header>
	)
}
