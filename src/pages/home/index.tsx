// Adapted directly from Umbrel Bitcoin's HomePage: same hero, globe crop, ring, and lower strip.
import {useEffect, useState} from 'react'
import {Info} from 'lucide-react'
import {Card, CardContent} from '@/components/ui/card'
import {GradientBorderTopBottom, GradientBorderFromCorners} from '@/components/shared/GradientBorders'
import InfoDialog from '@/components/shared/InfoDialog'
import PoolNotice from '@/components/PoolNotice'
import {usePoolData} from '@/hooks/PoolContext'
import {duration, hashrate} from '@/helpers/display'
import {usePoolLocation} from '@/hooks/usePoolLocation'
import Globe from './Globe'
import PeersChart from './PeersChart'
import StatusDot from './StatusDot'
import HashrateAverages from './HashrateAverages'

export default function HomePage() {
	const {pool, loading, error, stale} = usePoolData()
	const {data: location} = usePoolLocation()
	const [globeSize, setGlobeSize] = useState(650)
	useEffect(() => {
		const resize = () => setGlobeSize(window.innerWidth >= 768 ? 650 : window.innerWidth >= 500 ? 1000 : 700)
		resize()
		window.addEventListener('resize', resize)
		return () => window.removeEventListener('resize', resize)
	}, [])
	const running = !!pool && !error && !stale
	return (
		<>
			<PoolNotice />
			<Card
				data-testid='home-hero'
				className='bg-card-gradient backdrop-blur-2xl border-none mb-5 pt-4 pb-0 md:pb-4 rounded-3xl'
			>
				<GradientBorderTopBottom depth='7%' />
				<CardContent className='flex flex-col md:flex-row px-4 items-center'>
					<div className='relative w-full flex-none md:flex-1 h-64 md:h-[375px] rounded-2xl bg-neutral-900/20 border-white/10 border-[0.5px] overflow-hidden'>
						<div className='absolute top-[-50%] left-[-40%] w-[500%] h-[500%] rounded-full bg-[#080d10] pointer-events-none' />
						<GradientBorderFromCorners />
						<div className='relative md:top-[-20%] md:right-[-5%] sm:top-[-40%] sm:right-[20%] top-[-25%] right-[40%]'>
							<Globe width={globeSize} height={globeSize} location={location} />
						</div>
						<div className='absolute top-[7%] left-[5%] flex items-center gap-1 text-[14px]'>
							<StatusDot running={running} />
							<span className={running ? 'text-[#76d9f5] ml-1' : 'text-white/60 ml-1'}>
								{loading ? 'Connecting' : running ? 'Running' : 'Waiting for updates'}
							</span>
							{running && <span className='text-white/60'>for {duration(pool.runtime)}</span>}
							{import.meta.env.DEV && <span className='text-white/35 text-xs ml-1'>· Preview</span>}
						</div>
						<div className='absolute top-3 right-3'>
							<InfoDialog
								trigger={<Info className='w-4 h-4 text-white/50 hover:text-white/80' />}
								title='Your Bitcoin mining pool'
								description={
									location
										? 'The pulsing blue dot marks the approximate location of the public IP reported by your Bitcoin node. Drag the globe to look around.'
										: 'Drag the globe to look around. Your Bitcoin node has not supplied a public IP location.'
								}
							/>
						</div>
						<div className='absolute top-[70%] md:top-[80%] left-[5%] pointer-events-none'>
							<div className='text-[14px] text-white/50 mb-1'>Pool hashrate · 5 minutes</div>
							<h2 className='text-[30px] font-medium bg-text-gradient bg-clip-text text-transparent'>
								{hashrate(pool?.hashrate5m)}
							</h2>
						</div>
					</div>
					<div className='w-full md:w-[215px] flex flex-col items-center mt-4 md:mt-0 pb-7 md:pb-0'>
						<PeersChart />
					</div>
				</CardContent>
			</Card>
			<HashrateAverages />
		</>
	)
}
