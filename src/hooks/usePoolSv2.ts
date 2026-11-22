import {useMemo} from 'react'
import {useQuery} from '@tanstack/react-query'
import {parsePoolSv2} from '@/helpers/sv2'

export function usePoolSv2() {
	const query = useQuery({
		queryKey: ['pool-sv2'],
		queryFn: async ({signal}) => {
			const response = await fetch('/pool/sv2.json', {signal, cache: 'no-store'})
			if (!response.ok) return null
			try {
				return parsePoolSv2(await response.json())
			} catch {
				return null
			}
		},
		refetchInterval: 60000,
		retry: false,
	})
	const data = useMemo(() => parsePoolSv2(query.data), [query.data])
	return {...query, data}
}
