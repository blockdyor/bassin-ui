import {createContext, useContext, type ReactNode} from 'react'
import {usePool} from './usePool'
const Context = createContext<ReturnType<typeof usePool> | null>(null)
export function PoolProvider({children}: {children: ReactNode}) {
	return <Context.Provider value={usePool()}>{children}</Context.Provider>
}
export function usePoolData() {
	const value = useContext(Context)
	if (!value) throw new Error('PoolProvider missing')
	return value
}
