import { Failure, ProviderFailure } from '../_shared/gemini.ts'

const transientStatuses = new Set([408, 500, 502, 503, 504])
const budgetMs = 75_000

function retryAfterMs(value: string | null) {
  if (!value) return undefined
  if (/^\d+$/.test(value.trim())) return Number(value) * 1000
  const deadline = Date.parse(value)
  return Number.isFinite(deadline) ? Math.max(0, deadline - Date.now()) : undefined
}

// Generation retries share a single invoice lease and a single wall-clock budget.
export async function retryExtraction<T>(generate: (timeout: number) => Promise<T>): Promise<T> {
  const deadline = performance.now() + budgetMs
  for (let attempt = 0;; attempt++) {
    try {
      return await generate(
        Math.max(1, Math.min(attempt === 0 ? 50_000 : 25_000, Math.floor(deadline - performance.now()))),
      )
    } catch (err) {
      const upstream = err instanceof ProviderFailure ? err.upstreamStatus : undefined
      const retryAfter = err instanceof ProviderFailure ? retryAfterMs(err.retryAfter) : undefined
      const transient = upstream !== undefined
        ? transientStatuses.has(upstream) || (upstream === 429 && retryAfter !== undefined)
        : err instanceof TypeError ||
          err instanceof DOMException && ['TimeoutError', 'AbortError'].includes(err.name)
      if (upstream !== undefined || transient) {
        console.warn('Invoice provider attempt failed', { attempt: attempt + 1, upstream, transient })
      }
      if (!transient) throw err
      const delay = Math.max(retryAfter ?? 0, 500 * 2 ** attempt) + Math.random() * 250
      if (attempt >= 2 || performance.now() + delay + 2_000 >= deadline) {
        if (upstream === 429) throw err
        throw new Failure(502, 'AI extraction is temporarily unavailable. Please try again shortly.')
      }
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

export function extractionFailure(error: unknown) {
  if (error instanceof ProviderFailure) {
    if (error.upstreamStatus === 429) {
      return new Failure(429, 'AI extraction has reached its usage limit. Try again later.')
    }
    console.warn('Invoice provider rejected request', { upstream: error.upstreamStatus })
    return new Failure(502, 'AI extraction is temporarily unavailable. Please try again shortly.')
  }
  return error instanceof Failure ? error : new Failure(503, 'Extraction could not complete. Try again shortly.')
}
