import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {defaultConfig, parseConfig, validateConfig} from '@/helpers/config'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function useConfigState() {
	const queryClient = useQueryClient()
	const [raw, setRaw] = useState(JSON.stringify(defaultConfig, null, 2))
	const [baseline, setBaseline] = useState(raw)
	const [source, setSource] = useState('Bassin template')
	const [live, setLive] = useState(false)
	const [passwordsSet, setPasswordsSet] = useState<boolean[]>([])
	const [saveState, setSaveState] = useState<SaveState>('idle')
	const [saveError, setSaveError] = useState('')
	const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
	const latestRawRef = useRef(raw)
	const saveSeqRef = useRef(0)
	const sv2TimersRef = useRef<ReturnType<typeof setTimeout>[]>([])
	latestRawRef.current = raw
	const dirty = raw !== baseline

	const scheduleSv2Refetch = useCallback(() => {
		for (const timer of sv2TimersRef.current) clearTimeout(timer)
		sv2TimersRef.current = []
		void queryClient.invalidateQueries({queryKey: ['pool-sv2']})
		for (const delay of [3500, 7500]) {
			sv2TimersRef.current.push(
				setTimeout(() => {
					void queryClient.invalidateQueries({queryKey: ['pool-sv2']})
				}, delay),
			)
		}
	}, [queryClient])

	useEffect(() => {
		return () => {
			for (const timer of sv2TimersRef.current) clearTimeout(timer)
		}
	}, [])

	// Load live running configuration when served by bassin-server.py.
	useEffect(() => {
		let cancelled = false
		async function loadLive() {
			try {
				const res = await fetch('/api/config', {cache: 'no-store'})
				if (!res.ok) return
				const data = (await res.json()) as {
					live?: boolean
					config?: Record<string, unknown>
					passwordsSet?: unknown
				}
				if (cancelled || data?.live !== true || !data.config || typeof data.config !== 'object') return
				const serialized = JSON.stringify(data.config, null, 2)
				setLive(true)
				setPasswordsSet(Array.isArray(data.passwordsSet) ? data.passwordsSet.map(Boolean) : [])
				setRaw(serialized)
				setBaseline(serialized)
				setSource('Running pool (/config/ckpool.conf)')
				setSaveState('idle')
				setSaveError('')
			} catch {
				// Static preview or dev mode without live API: stay in local editor fallback mode.
			}
		}
		void loadLive()
		return () => {
			cancelled = true
		}
	}, [])

	const persistConfig = useCallback(
		async (snapshot: string) => {
			const seq = ++saveSeqRef.current
			setSaveState('saving')
			setSaveError('')
			try {
				const res = await fetch('/api/config', {
					method: 'PUT',
					cache: 'no-store',
					headers: {
						'Content-Type': 'application/json',
						'X-Bassin-Config': '1',
					},
					body: snapshot,
				})
				const data = (await res.json().catch(() => ({}))) as {
					error?: string
					passwordsSet?: unknown
					savedAt?: number
				}
				if (seq !== saveSeqRef.current) return
				if (!res.ok) {
					setSaveState('error')
					setSaveError(data.error || `Save failed (HTTP ${res.status}).`)
					return
				}
				if (Array.isArray(data.passwordsSet)) {
					setPasswordsSet(data.passwordsSet.map(Boolean))
				}
				if (latestRawRef.current === snapshot) {
					setBaseline(snapshot)
					setSaveState('saved')
					setLastSavedAt(typeof data.savedAt === 'number' ? data.savedAt : Date.now())
				}
				scheduleSv2Refetch()
			} catch {
				if (seq !== saveSeqRef.current) return
				setSaveState('error')
				setSaveError('Could not reach the pool server to save configuration.')
			}
		},
		[scheduleSv2Refetch],
	)

	// Debounced auto-save whenever a valid edit is made in live mode.
	useEffect(() => {
		if (!live || !dirty) return
		let parsed: Record<string, unknown>
		try {
			parsed = parseConfig(raw)
		} catch {
			return
		}
		if (validateConfig(parsed, {passwordsSet}).length > 0) return
		const timer = setTimeout(() => {
			void persistConfig(raw)
		}, 450)
		return () => clearTimeout(timer)
	}, [live, dirty, raw, passwordsSet, persistConfig])

	const saveNow = useCallback(() => {
		if (!live) return
		try {
			const parsed = parseConfig(latestRawRef.current)
			if (validateConfig(parsed, {passwordsSet}).length > 0) return
		} catch {
			return
		}
		void persistConfig(latestRawRef.current)
	}, [live, passwordsSet, persistConfig])

	useEffect(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (dirty) event.preventDefault()
		}
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [dirty])

	return {
		raw,
		setRaw,
		baseline,
		setBaseline,
		source,
		setSource,
		dirty,
		live,
		passwordsSet,
		saveState,
		saveError,
		lastSavedAt,
		saveNow,
	}
}
const Context = createContext<ReturnType<typeof useConfigState> | null>(null)
export function ConfigProvider({children}: {children: ReactNode}) {
	return <Context.Provider value={useConfigState()}>{children}</Context.Provider>
}
export function useConfig() {
	const value = useContext(Context)
	if (!value) throw new Error('ConfigProvider missing')
	return value
}
