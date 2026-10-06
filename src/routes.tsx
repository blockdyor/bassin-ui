import {createHashRouter, createRoutesFromElements, Navigate, Route} from 'react-router-dom'
import {Layout} from './components/Layout/Layout'
import HomePage from './pages/home'
import InsightsPage from './pages/insights'
import SettingsPage from './pages/settings'
export const router = createHashRouter(
	createRoutesFromElements(
		<Route element={<Layout />}>
			<Route index element={<HomePage />} />
			<Route path='insights' element={<InsightsPage />} />
			<Route path='settings' element={<SettingsPage />} />
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
