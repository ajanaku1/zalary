// Read an env var from either Vite's import.meta.env (browser/build) or
// process.env (Node — used by scripts/seed-devnet.ts and any future tooling).
// The libs in lib/ are imported by both contexts and need to work in both.

export function getEnv(key: string): string | undefined {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key]
  }
  try {
    const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> }
    return meta.env?.[key]
  } catch {
    return undefined
  }
}
