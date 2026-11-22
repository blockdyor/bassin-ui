import {lazy, Suspense} from 'react'
import {createHashRouter, createRoutesFromElements, Navigate, Route} from 'react-router-dom'
import {Layout} from './components/Layout/Layout'

const HomePage = lazy(() => import('./pages/home'))
const InsightsPage = lazy(() => import('./pages/insights'))
const SettingsPage = lazy(() => import('./pages/settings'))

function LazyPage({children}: {children: React.ReactNode}) {
	return <Suspense fallback={<div className='min-h-[240px]' />}>{children}</Suspense>
}

export const router = createHashRouter(
	createRoutesFromElements(
		<Route element={<Layout />}>
			<Route
				index
				element={
					<LazyPage>
						<HomePage />
					</LazyPage>
				}
			/>
			<Route
				path='insights'
				element={
					<LazyPage>
						<InsightsPage />
					</LazyPage>
				}
			/>
			<Route
				path='settings'
				element={
					<LazyPage>
						<SettingsPage />
					</LazyPage>
				}
			/>
			<Route path='overview' element={<Navigate to='/' replace />} />
			<Route path='workers' element={<Navigate to='/insights' replace />} />
			<Route path='logs' element={<Navigate to='/settings?tab=logs' replace />} />
			<Route
				path='*'
				element={
					<div className='text-center py-20 text-white/60'>
						Page not found.{' '}
						<a className='text-[#76d9f5]' href='#/'>
							Return home
						</a>
					</div>
				}
			/>
		</Route>,
	),
)
