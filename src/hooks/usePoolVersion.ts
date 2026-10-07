import {useQuery} from '@tanstack/react-query'
import {parsePoolVersion} from '@/helpers/poolVersion'

export function usePoolVersion() {
	return useQuery({
		queryKey: ['pool-version'],
		queryFn: async ({signal}) => {
			const response = await fetch('/pool/version.json', {signal, cache: 'no-store'})
			if (!response.ok) return null
			try {
				return parsePoolVersion(await response.json())
			} catch {
				return null
			}
		},
		refetchInterval: 60000,
		retry: false,
	})
}
