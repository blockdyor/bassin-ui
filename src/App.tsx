import {RouterProvider} from 'react-router-dom'
import {QueryClient, QueryClientProvider} from '@tanstack/react-query'
import {MotionConfig} from 'framer-motion'
import {Toaster} from '@/components/ui/sonner'
import {PoolProvider} from '@/hooks/PoolContext'
import {ConfigProvider} from '@/hooks/ConfigContext'
import {router} from '@/routes'
const queryClient = new QueryClient()
export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<MotionConfig reducedMotion='user'>
				<PoolProvider>
					<ConfigProvider>
						<RouterProvider router={router} />
						<Toaster richColors position='top-right' />
					</ConfigProvider>
				</PoolProvider>
			</MotionConfig>
		</QueryClientProvider>
	)
}
