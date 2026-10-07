// Umbrel's original hex-map globe, with one pool marker and drag-to-rotate controls.
import {memo, useState, useEffect, useRef, useCallback, useMemo} from 'react'
import Globe, {type GlobeMethods} from 'react-globe.gl'
import {ErrorBoundary} from 'react-error-boundary'
import {useReducedMotion} from 'framer-motion'
import type {Mesh} from 'three'
import GlobeImage from '@/assets/globe-full.webp'
import type {PoolLocation} from '@/helpers/location'

const rendererConfig = {antialias: true, alpha: true}
const hexColor = () => 'rgba(54, 84, 97, 0.8)'
const ringColor = () => (t: number) => `rgba(83,203,234,${Math.max(0, 1 - t)})`
type Props = {width?: number; height?: number; location?: PoolLocation | null}
function ImageFallback({width = 650, height = 650}: Props) {
	return (
		<div style={{width, height, scale: 0.8}}>
			<img src={GlobeImage} alt='Bitcoin network globe' />
		</div>
	)
}
export default memo(function LiveGlobe(props: Props) {
	const [contextLost, setContextLost] = useState(false)
	const onContextLost = useCallback(() => setContextLost(true), [])
	return (
		<ErrorBoundary fallbackRender={() => <ImageFallback {...props} />}>
			{contextLost ? <ImageFallback {...props} /> : <GlobeWebGL {...props} onContextLost={onContextLost} />}
		</ErrorBoundary>
	)
})
function GlobeWebGL({width = 650, height = 650, location, onContextLost}: Props & {onContextLost: () => void}) {
	const [countries, setCountries] = useState<{features: object[]}>({features: []})
	const [initialize, setInitialize] = useState(false)
	const [ready, setReady] = useState(false)
	const ref = useRef<GlobeMethods | undefined>(undefined)
	const reduced = useReducedMotion()
	const interacted = useRef(false)
	const marker = useMemo(
		() => (location ? [{lat: location.latitude, lng: location.longitude}] : []),
		[location?.latitude, location?.longitude],
	)
	useEffect(() => {
		const timer = setTimeout(() => setInitialize(true), 200)
		return () => clearTimeout(timer)
	}, [])
	useEffect(() => {
		const globe = ref.current
		if (!initialize || !globe) return
		const renderer = globe.renderer()
		const composer = globe.postProcessingComposer()
		const canvas = renderer.domElement
		const handleContextLost = (event: Event) => {
			event.preventDefault()
			onContextLost()
		}
		canvas.addEventListener('webglcontextlost', handleContextLost)
		// The large cropped canvas does not need a Retina-sized drawing buffer on phones.
		const pixelRatio = Math.min(window.devicePixelRatio, window.matchMedia('(pointer: coarse)').matches ? 1 : 2)
		renderer.setPixelRatio(pixelRatio)
		composer.setPixelRatio(pixelRatio)
		return () => {
			canvas.removeEventListener('webglcontextlost', handleContextLost)
			// globe.gl clears its layers, but does not dispose its renderer or render targets.
			globe.pauseAnimation()
			globe.controls().dispose()
			globe.scene().traverse((object) => {
				const mesh = object as Mesh
				mesh.geometry?.dispose()
				const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
				materials.forEach((material) => material?.dispose())
			})
			composer.passes.forEach((pass) => pass.dispose())
			composer.dispose()
			renderer.dispose()
			if (!renderer.getContext().isContextLost()) renderer.forceContextLoss()
		}
	}, [initialize, onContextLost])
	useEffect(() => {
		const globe = ref.current
		if (!ready || !globe) return
		const update = () => (document.hidden ? globe.pauseAnimation() : globe.resumeAnimation())
		update()
		document.addEventListener('visibilitychange', update)
		return () => document.removeEventListener('visibilitychange', update)
	}, [ready])
	useEffect(() => {
		const controller = new AbortController()
		fetch('/datasets/ne_110m_admin_0_countries.geojson', {signal: controller.signal})
			.then((response) => {
				if (!response.ok) throw new Error('Map unavailable')
				return response.json()
			})
			.then(setCountries)
			.catch(() => {})
		return () => controller.abort()
	}, [])
	const controls = useCallback(() => {
		if (!ref.current) return
		const control = ref.current.controls()
		control.enableRotate = true
		control.enableZoom = false
		control.enablePan = false
		control.autoRotate = !reduced && !interacted.current
		control.autoRotateSpeed = 0.5
	}, [reduced])
	const onReady = useCallback(() => {
		controls()
		setReady(true)
	}, [controls])
	useEffect(controls, [controls, ready])
	useEffect(() => {
		if (!ready || !ref.current || interacted.current) return
		// The mobile upstream crop places the globe's center below the visible frame.
		const tilt = width === 650 ? 0 : width >= 1000 ? 45 : 25
		ref.current.pointOfView(
			{lat: location ? Math.max(-85, location.latitude - tilt) : 30, lng: location?.longitude ?? -80},
			reduced ? 0 : 700,
		)
	}, [ready, location?.latitude, location?.longitude, width, reduced])
	function startDrag() {
		interacted.current = true
		if (ref.current) ref.current.controls().autoRotate = false
	}
	if (!initialize) return <div style={{width, height}} />
	return (
		<div
			data-testid='pool-globe'
			data-marker-count={marker.length}
			className='cursor-grab active:cursor-grabbing'
			aria-label='Pool location globe. Drag to rotate.'
			onPointerDown={startDrag}
			style={{width, height}}
		>
			<Globe
				ref={ref}
				width={width}
				height={height}
				rendererConfig={rendererConfig}
				backgroundColor='rgba(0,0,0,0)'
				atmosphereColor='#76d9f5'
				atmosphereAltitude={0.12}
				enablePointerInteraction
				waitForGlobeReady
				onGlobeReady={onReady}
				hexPolygonsData={countries.features}
				hexPolygonResolution={3}
				hexPolygonMargin={0.4}
				hexPolygonUseDots
				hexPolygonColor={hexColor}
				hexPolygonAltitude={0.001}
				pointsData={marker}
				pointColor={() => '#53cbea'}
				pointRadius={0.85}
				pointAltitude={0.008}
				pointLabel={() => 'Your Bitcoin node'}
				ringsData={reduced ? [] : marker}
				ringColor={ringColor}
				ringAltitude={0.012}
				ringMaxRadius={3}
				ringPropagationSpeed={1.6}
				ringRepeatPeriod={1500}
			/>
		</div>
	)
}
