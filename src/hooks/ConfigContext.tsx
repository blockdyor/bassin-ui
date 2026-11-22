import {createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode} from 'react'
import {useQueryClient} from '@tanstack/react-query'
import {defaultConfig, parseConfig, validateConfig} from '@/helpers/config'

export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const TOKEN_STORAGE_KEY = 'bassin_config_token'

function readSessionToken(): string {
	try {
		return window.sessionStorage.getItem(TOKEN_STORAGE_KEY) || ''
	} catch {
		return ''
	}
}

function writeSessionToken(token: string) {
	try {
		if (token) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, token)
		else window.sessionStorage.removeItem(TOKEN_STORAGE_KEY)
	} catch {
		// Ignore storage restrictions.
	}
}

function useConfigState() {
	const queryClient = useQueryClient()
	const [raw, setRaw] = useState(JSON.stringify(defaultConfig, null, 2))
	const [baseline, setBaseline] = useState(raw)
	const [source, setSource] = useState('Bassin template')
	const [live, setLive] = useState(false)
	const [authRequired, setAuthRequired] = useState(false)
	const [unlocked, setUnlocked] = useState(false)
	const [authError, setAuthError] = useState('')
	const [token, setToken] = useState<string>(() => readSessionToken())
	const [passwordsSet, setPasswordsSet] = useState<boolean[]>([])
	const [saveState, setSaveState] = useState<SaveState>('idle')
	const [saveError, setSaveError] = useState('')
	const [pendingRestart, setPendingRestart] = useState(false)
	const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
	const latestRawRef = useRef(raw)
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

	const loadLiveConfig = useCallback(async (candidateToken: string): Promise<boolean> => {
		const headers: Record<string, string> = {}
		if (candidateToken) headers.Authorization = `Bearer ${candidateToken}`
		try {
			const res = await fetch('/api/config', {cache: 'no-store', headers})
			if (res.status === 401) {
				const data = (await res.json().catch(() => ({}))) as {live?: boolean; authRequired?: boolean}
				if (data.live === true || data.authRequired === true) {
					setLive(true)
					setAuthRequired(true)
					setUnlocked(false)
					setToken('')
					writeSessionToken('')
					if (candidateToken) setAuthError('Invalid Bassin config password.')
				}
				return false
			}
			if (res.status === 403) {
				const data = (await res.json().catch(() => ({}))) as {live?: boolean; error?: string}
				if (data.live === true) {
					setLive(true)
					setAuthRequired(false)
					setUnlocked(false)
					setAuthError(data.error || 'Config API is disabled on the server.')
				}
				return false
			}
			if (!res.ok) return false
			const data = (await res.json()) as {
				live?: boolean
				config?: Record<string, unknown>
				passwordsSet?: unknown
			}
			if (data?.live !== true || !data.config || typeof data.config !== 'object') return false
			const serialized = JSON.stringify(data.config, null, 2)
			setLive(true)
			setAuthRequired(Boolean(candidateToken))
			setUnlocked(true)
			setAuthError('')
			if (candidateToken) {
				setToken(candidateToken)
				writeSessionToken(candidateToken)
			}
			setPasswordsSet(Array.isArray(data.passwordsSet) ? data.passwordsSet.map(Boolean) : [])
			setRaw(serialized)
			setBaseline(serialized)
			setSource('Running pool (/config/ckpool.conf)')
			setSaveState('idle')
			setSaveError('')
			return true
		} catch {
			return false
		}
	}, [])

	// Probe live API on mount (uses cached session token if already unlocked in this tab).
	useEffect(() => {
		void loadLiveConfig(readSessionToken())
	}, [loadLiveConfig])

	const unlock = useCallback(
		async (candidateToken: string) => {
			const trimmed = candidateToken.trim()
			if (!trimmed) {
				setAuthError('Enter your Bassin app password.')
				return false
			}
			setAuthError('')
			return loadLiveConfig(trimmed)
		},
		[loadLiveConfig],
	)

	const lock = useCallback(() => {
		writeSessionToken('')
		setToken('')
		setUnlocked(false)
		setAuthRequired(true)
		setAuthError('')
		setSaveState('idle')
		setSaveError('')
		const empty = JSON.stringify(defaultConfig, null, 2)
		setRaw(empty)
		setBaseline(empty)
		setPasswordsSet([])
	}, [])

	const discard = useCallback(() => {
		setRaw(baseline)
		setSaveState('idle')
		setSaveError('')
	}, [baseline])

	const save = useCallback(
		async ({restart}: {restart: boolean}): Promise<boolean> => {
			if (!live || !unlocked) return false
			const snapshot = latestRawRef.current
			let parsed: Record<string, unknown>
			try {
				parsed = parseConfig(snapshot)
			} catch {
				return false
			}
			if (validateConfig(parsed, {passwordsSet}).length > 0) return false

			setSaveState('saving')
			setSaveError('')
			try {
				const headers: Record<string, string> = {
					'Content-Type': 'application/json',
					'X-Bassin-Config': '1',
				}
				if (token) headers.Authorization = `Bearer ${token}`
				if (restart) headers['X-Bassin-Restart'] = '1'
				const res = await fetch(restart ? '/api/config?restart=1' : '/api/config', {
					method: 'PUT',
					cache: 'no-store',
					headers,
					body: snapshot,
				})
				const data = (await res.json().catch(() => ({}))) as {
					error?: string
					passwordsSet?: unknown
					savedAt?: number
					restarted?: boolean
				}
				if (res.status === 401) {
					setUnlocked(false)
					setAuthRequired(true)
					setToken('')
					writeSessionToken('')
					setSaveState('error')
					setAuthError('Session expired. Unlock Settings to save.')
					return false
				}
				if (!res.ok) {
					setSaveState('error')
					setSaveError(data.error || `Save failed (HTTP ${res.status}).`)
					return false
				}
				if (Array.isArray(data.passwordsSet)) {
					setPasswordsSet(data.passwordsSet.map(Boolean))
				}
				if (latestRawRef.current === snapshot) {
					setBaseline(snapshot)
				}
				setSaveState('saved')
				setLastSavedAt(typeof data.savedAt === 'number' ? data.savedAt : Date.now())
				setPendingRestart(!restart)
				if (restart) scheduleSv2Refetch()
				return true
			} catch {
				setSaveState('error')
				setSaveError('Could not reach the pool server to save configuration.')
				return false
			}
		},
		[live, unlocked, passwordsSet, token, scheduleSv2Refetch],
	)

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
		authRequired,
		unlocked,
		authError,
		unlock,
		lock,
		discard,
		save,
		passwordsSet,
		saveState,
		saveError,
		pendingRestart,
		lastSavedAt,
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
