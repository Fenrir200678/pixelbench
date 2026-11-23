export const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
export const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))
