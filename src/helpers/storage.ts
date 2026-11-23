export function readStoredValue(key: string): string | null {
  return localStorage.getItem(key)
}

export function readStorage<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(readStoredValue(key) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}

export function writeStorage(key: string, data: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}
