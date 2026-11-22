import {useMemo} from 'react'
import {useQuery} from '@tanstack/react-query'
import {parsePoolLocation} from '@/helpers/location'
export function usePoolLocation() {
	const query = useQuery({
		queryKey: ['pool-location'],
		queryFn: async ({signal}) => {
			const response = await fetch('/pool/location.json', {signal, cache: 'no-store'})
			if (!response.ok) return null
			try {
				return parsePoolLocation(await response.json())
			} catch {
				return null
			}
		},
		staleTime: 30 * 60 * 1000,
		refetchInterval: 30 * 60 * 1000,
		retry: false,
	})
	const data = useMemo(() => parsePoolLocation(query.data), [query.data])
	return {...query, data}
}
