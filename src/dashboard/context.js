import { createContext, useContext } from 'react'

// Everything a widget needs: loaded data, the period split, scope, navigation, targets.
export const DashContext = createContext(null)
export const useDash = () => useContext(DashContext)
