let _ctx = null
export const setAIPageContext = (ctx) => { _ctx = ctx }
export const clearAIPageContext = () => { _ctx = null }
export const getAIPageContext = () => _ctx
