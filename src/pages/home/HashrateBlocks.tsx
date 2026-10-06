// Adapts the upstream Blocks canvas, RoundedBox geometry, local font, and hover motion to CKPool averages.
import {useRef, useMemo, useEffect} from 'react'
import {Canvas, useFrame} from '@react-three/fiber'
import {RoundedBox} from '@react-three/drei/core/RoundedBox'
import {Text} from '@react-three/drei/core/Text'
import {configureTextBuilder} from 'troika-three-text'
import {Group} from 'three'
import {ErrorBoundary} from 'react-error-boundary'
import {useReducedMotion} from 'framer-motion'
import {usePoolData} from '@/hooks/PoolContext'
import {hashrate} from '@/helpers/display'
import {createLiquidMaterial} from './Blocks/liquidMaterial'
import {DISPLAY_CONFIG} from './Blocks/display.config'
import {useGlobalMouse} from './Blocks/useGlobalMouse'
configureTextBuilder({useWorker: false})
const windows = [
	['hashrate1m', '1 minute'],
	['hashrate5m', '5 minutes'],
	['hashrate1hr', '1 hour'],
	['hashrate1d', '24 hours'],
	['hashrate7d', '7 days'],
] as const
function Cube({index, value, label}: {index: number; value: string; label: string}) {
	const ref = useRef<Group>(null)
	const mouse = useGlobalMouse()
	const reduced = useReducedMotion()
	const liquid = useMemo(() => createLiquidMaterial(), [])
	useEffect(() => () => liquid.dispose(), [liquid])
	useFrame(({clock}) => {
		liquid.uniforms.uTime.value = reduced ? index : clock.elapsedTime * 0.3 + index
		liquid.uniforms.uOpacity.value = 0.8
	})
	useFrame(() => {
		if (!ref.current || reduced) return
		ref.current.rotation.y += (mouse.x * 0.16 - ref.current.rotation.y) * 0.06
		ref.current.rotation.x += (-mouse.y * 0.16 - ref.current.rotation.x) * 0.06
	})
	return (
		<group ref={ref} position={[(index - 2) * (DISPLAY_CONFIG.CUBE_SIZE + DISPLAY_CONFIG.GAP), 0, 0]}>
			<RoundedBox args={[2.8, 2.8, 1.5]} radius={0.03} smoothness={4}>
				<meshStandardMaterial color='#b7d3dc' metalness={0.8} roughness={0.5} />
			</RoundedBox>
			<mesh position={[0, 0, 0.752]}>
				<planeGeometry args={[2.7, 2.7]} />
				<meshStandardMaterial color='#061822' roughness={0.8} />
			</mesh>
			{/* Upstream liquid shader, tinted aqua; decorative, not a share/block count. */}
			<mesh position={[0, 0, 0.756]}>
				<planeGeometry args={[2.7, 2.7]} />
				<primitive object={liquid} attach='material' />
			</mesh>
			<Text position={[-1.2, -0.67, 0.78]} fontSize={0.29} anchorX='left' color='#e9faff' font='/roboto-regular.ttf'>
				{value}
			</Text>
			<Text position={[-1.2, -1.06, 0.78]} fontSize={0.2} anchorX='left' color='#83b7c7' font='/roboto-regular.ttf'>
				{label}
			</Text>
		</group>
	)
}
export default function HashrateBlocks() {
	const {pool} = usePoolData()
	const fallback = (
		<div className='w-[768px] grid grid-cols-5 gap-2 py-6 px-4'>
			{windows.map(([key, label]) => (
				<div key={key} className='h-[140px] border border-white/25 bg-[#0a202c] p-3 flex flex-col justify-end'>
					<strong className='text-white text-[15px] font-normal'>{hashrate(pool?.[key])}</strong>
					<span className='text-[11px] text-white/60'>{label}</span>
				</div>
			))}
		</div>
	)
	return (
		<div className='w-[768px] h-[180px] overflow-hidden' aria-label='Pool hashrate averages'>
			<div className='sr-only'>
				{windows.map(([key, label]) => (
					<p key={key}>
						{label}: {hashrate(pool?.[key])}
					</p>
				))}
			</div>
			<ErrorBoundary fallback={fallback}>
				<Canvas fallback={fallback} orthographic camera={{position: [0, 0, 8], zoom: 50}}>
					<ambientLight intensity={0.8} />
					<directionalLight position={[5, 8, 3]} intensity={1.5} />
					{windows.map(([key, label], index) => (
						<Cube key={key} index={index} label={label} value={hashrate(pool?.[key])} />
					))}
				</Canvas>
			</ErrorBoundary>
		</div>
	)
}
