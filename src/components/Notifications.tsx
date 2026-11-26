import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { analytics, displayDate, money, useWorkspace } from '../services/analytics'
import { db } from '../services/supabase'
import { Icon } from './Icon'
import { useIdentity } from './Access'
import { today } from '../../supabase/functions/_shared/metrics'

export function useNotifications() {
  const { restaurant, rows } = useWorkspace(), { id: user } = useIdentity()
  const [seen, setSeen] = useState<Set<string>>(new Set()),
    [error, fail] = useState(''),
    [loading, load] = useState(true),
    [revision, retry] = useState(0),
    [busy, marking] = useState(false)
  const alerts = useMemo(() => {
    if (!restaurant.alerts_enabled) return []
    const asOf = today()
    const confirmed = rows.filter((r) => r.status === 'ready' && r.currency === 'CAD' && r.date <= asOf)
    const data = analytics(confirmed)
    return data.months.slice().reverse().flatMap((month) =>
      data.comparisons(month).filter((x) => x.delta !== null && x.delta >= restaurant.alert_threshold).map(
        (x) => ({
          ...x,
          month,
          id: month + '/' + x.key,
          date: confirmed.filter((r) =>
            r.date.startsWith(month) && r.supplierId === x.key.split('/')[0] &&
            r.lines.some((l) => l.productKey === x.key.split('/')[1])
          ).map((r) => r.date).sort().at(-1)!,
        }),
      )
    )
  }, [rows, restaurant.alerts_enabled, restaurant.alert_threshold])
  useEffect(() => {
    let active = true
    load(true)
    fail('')
    void (async () => {
      const result = new Set<string>()
      for (let offset = 0;; offset += 300) {
        const r = await db!.from('alert_reads').select('period,supplier_id,ingredient_id').eq(
          'restaurant_id',
          restaurant.id,
        ).eq('user_id', user).order('period').order('supplier_id').order('ingredient_id').range(
          offset,
          offset + 299,
        )
        if (!active) return
        if (r.error) {
          fail('Read status could not be loaded.')
          break
        }
        for (const row of r.data) {
          result.add(row.period.slice(0, 7) + '/' + row.supplier_id + '/' + row.ingredient_id)
        }
        if (r.data.length < 300) {
          setSeen(result)
          break
        }
      }
      load(false)
    })()
    return () => {
      active = false
    }
  }, [restaurant.id, user, revision])
  async function mark(ids: string[]) {
    marking(true)
    fail('')
    try {
      for (let i = 0; i < ids.length; i += 200) {
        const values = ids.slice(i, i + 200).map((id) => {
          const [month, supplier_id, ingredient_id] = id.split('/')
          return { restaurant_id: restaurant.id, period: month + '-01', supplier_id, ingredient_id }
        })
        const r = await db!.from('alert_reads').upsert(values, { ignoreDuplicates: true })
        if (r.error) throw r.error
        setSeen((s) => new Set([...s, ...ids.slice(i, i + 200)]))
      }
    } catch {
      fail('Read status could not be saved. Retry.')
    } finally {
      marking(false)
    }
  }
  return { alerts, seen, error, loading, busy, mark, retry: () => retry((n) => n + 1) }
}
type State = ReturnType<typeof useNotifications>
export function AlertList({ state, full = false }: { state: State; full?: boolean }) {
  const [filter, setFilter] = useState('All'), [search, find] = useState('')
  const { alerts, seen, loading, busy, error } = state
  const unread = alerts.filter((a) => !seen.has(a.id))
  const visible = alerts.filter((a) =>
    (filter === 'All' || (filter === 'Read') === seen.has(a.id)) &&
    (a.ingredient + ' ' + a.supplier).toLowerCase().includes(search.trim().toLowerCase())
  )
  return (
    <section className='panel noticeList' aria-label='Price notifications'>
      <div className='noticeTools'>
        <h2>Price alerts</h2>
        {unread.length > 0 && !loading && (
          <button
            className='outline'
            disabled={busy}
            onClick={() => void state.mark(unread.map((a) => a.id))}
          >
            Mark all as read
          </button>
        )}
      </div>
      {full && (
        <div className='noticeTools'>
          <input
            aria-label='Filter by ingredient or supplier'
            placeholder='Ingredient or supplier'
            value={search}
            onChange={(e) => find(e.target.value)}
          />
          <select aria-label='Read status' value={filter} onChange={(e) => setFilter(e.target.value)}>
            {['All', 'Unread', 'Read'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
      )}
      {error && (
        <p role='alert'>
          {error} <button onClick={state.retry}>Retry</button>
        </p>
      )}
      {loading
        ? <p role='status'>Loading alerts…</p>
        : !visible.length
        ? <p>No matching price increases.</p>
        : (full ? visible : visible.slice(0, 4)).map((a) => (
          <article key={a.id}>
            <small>{seen.has(a.id) ? 'Read' : 'Unread'} · {displayDate(a.date)}</small>
            <strong>{a.ingredient} · +{a.delta!.toFixed(1)}%</strong>
            <p>{a.supplier} · {money(a.previous!)} → {money(a.price)} / {a.unit}</p>
            <Link
              to={'/price-tracker?' + new URLSearchParams({ month: a.month, item: a.key, asOf: today() })}
            >
              View price history
            </Link>
            {!seen.has(a.id) && (
              <button disabled={busy} onClick={() => void state.mark([a.id])}>Mark as read</button>
            )}
          </article>
        ))}
      {!full && <Link to='/notifications'>View all alerts</Link>}
    </section>
  )
}
export function Bell({ state }: { state: State }) {
  const [open, set] = useState(false),
    ref = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLButtonElement>(null),
    loc = useLocation()
  useEffect(() => set(false), [loc.key])
  useEffect(() => {
    if (!open) return
    const outside = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) set(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        set(false)
        trigger.current?.focus()
      }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', outside)
      document.removeEventListener('keydown', esc)
    }
  }, [open])
  const count = state.alerts.filter((a) => !state.seen.has(a.id)).length
  return (
    <div ref={ref} className='bell'>
      <button
        ref={trigger}
        aria-label={'Notifications' + (count ? ', ' + count + ' unread' : '')}
        aria-expanded={open}
        onClick={() => set(!open)}
      >
        <Icon name='bell' size={19} />
        {count > 0 && !state.loading && !state.error && <b>{count}</b>}
      </button>
      {open && <AlertList state={state} />}
    </div>
  )
}
