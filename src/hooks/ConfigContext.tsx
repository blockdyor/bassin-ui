import {createContext, useContext, useEffect, useState, type ReactNode} from 'react'
import {defaultConfig} from '@/helpers/config'
function useConfigState() {
	const [raw, setRaw] = useState(JSON.stringify(defaultConfig, null, 2))
	const [baseline, setBaseline] = useState(raw)
	const [source, setSource] = useState('Bassin template')
	const dirty = raw !== baseline
	useEffect(() => {
		const warn = (event: BeforeUnloadEvent) => {
			if (dirty) event.preventDefault()
		}
		window.addEventListener('beforeunload', warn)
		return () => window.removeEventListener('beforeunload', warn)
	}, [dirty])
	return {raw, setRaw, baseline, setBaseline, source, setSource, dirty}
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
