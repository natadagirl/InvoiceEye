import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAnalytics, useWorkspace } from '../services/analytics'
import { db } from '../services/supabase'
import type { Answer } from '../../supabase/functions/chat-assistant/evidence'
import './assistant.css'

type Conversation = { id: string; title: string; updated_at: string }
type Turn = { id: string; question: string; answer: Answer }
type Scope = {
  month?: string
  item?: string
  supplierId?: string
  invoice?: string
  report?: string
  alerts?: string
}
function Evidence({ answer: a }: { answer: Answer }) {
  return (
    <div className='chatEvidence'>
      <h3>{a.heading}</h3>
      <small>{a.period}</small>
      {a.rows.length > 0 && (
        <div className='tableScroll'>
          <table>
            <thead>
              <tr>{a.columns.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>{a.rows.map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{v}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
      {a.recommendation && (
        <p>
          <strong>AI-assisted recommendation</strong>
          <br />
          {a.recommendation}
        </p>
      )}
      <ul>{a.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      <div className='chatSources'>
        {a.sources.filter((s) => /^\/(invoices|price-tracker|ai-insights)\?/.test(s.href)).map((s) => (
          <Link key={s.href} to={s.href}>{s.label}</Link>
        ))}
      </div>
    </div>
  )
}
export function Assistant({ month, menu }: { month: string; menu: boolean }) {
  const { restaurant, rows } = useWorkspace(), { pathname, search } = useLocation(), navigate = useNavigate()
  const full = pathname === '/ai-assistant', storage = 'invoiceeye:chat:' + restaurant.id
  const [open, setOpen] = useState(false),
    [list, setList] = useState<Conversation[]>([]),
    [active, select] = useState(() => sessionStorage.getItem(storage) ?? '')
  const [turns, setTurns] = useState<Turn[]>([]),
    [draft, edit] = useState(''),
    [error, fail] = useState(''),
    [busy, sending] = useState(false),
    [loading, load] = useState(false),
    [revision, refresh] = useState(0)
  const [action, changeAction] = useState<'' | 'rename' | 'delete'>(''),
    [title, setTitle] = useState(''),
    [history, showHistory] = useState(false)
  const [removed, remove] = useState(false),
    [carried, carry] = useState<{ label: string; scope: Scope } | null>(null)
  const scroller = useRef<HTMLDivElement>(null),
    following = useRef(true),
    locked = useRef(false),
    retry = useRef<{ id: string; cid: string; text: string; scope: Scope } | null>(null)
  const visible = open || full, params = new URLSearchParams(search)
  const pageName: Record<string, string> = {
    '/': 'Dashboard',
    '/price-tracker': params.has('alerts') ? 'Price alerts' : 'Price Tracker',
    '/invoices': 'Invoices',
    '/ai-insights': 'AI Insights',
  }
  const { comparisons } = useAnalytics()
  const scope: Scope = { month }
  for (const key of ['item', 'supplierId', 'invoice', 'report', 'alerts'] as const) {
    const value = params.get(key)
    if (value) scope[key] = value
  }
  if (params.get('selectedInvoice')) scope.invoice = params.get('selectedInvoice')!
  if (pathname === '/price-tracker' && !scope.item) scope.item = comparisons(month)[0]?.key
  if (pathname === '/invoices' && params.get('supplier')) {
    scope.supplierId = rows.find((r) => r.supplier === params.get('supplier'))?.supplierId ?? undefined
  }
  const product = scope.item
    ? rows.flatMap((r) => r.lines).find((l) => l.productKey === scope.item?.split('/')[1])?.ingredient
    : ''
  const detail = product || rows.find((r) => r.uuid === scope.invoice)?.id ||
    rows.find((r) => r.supplierId === scope.supplierId)?.supplier || (scope.report ? 'Saved report' : '')
  const context = removed
    ? null
    : full
    ? carried
    : pageName[pathname]
    ? { scope, label: [pageName[pathname], detail, month].filter(Boolean).join(' · ') }
    : null
  const eligible = rows.filter((r) =>
    r.status === 'ready' && r.currency === 'CAD' &&
    r.date <= new Date().toLocaleDateString('en-CA', { timeZone: 'America/Edmonton' })
  )
  const starters = eligible.length
    ? [
      'Summarize my purchasing performance this month.',
      ...(new Set(eligible.map((r) => r.supplierId)).size > 1
        ? ['How concentrated is my supplier spending?']
        : []),
      ...(eligible.some((r) => r.lines.some((l) => l.productKey))
        ? ['Which ingredients should I negotiate prices for?']
        : []),
    ]
    : ['What purchasing records are available?']
  const increases = comparisons(month).filter((p) => p.delta !== null && p.delta > 0).map((p) => p.ingredient)
  if (increases.includes('Carrots') && increases.includes('Roma tomatoes')) {
    starters.push('How did carrot and tomato prices change?')
  }
  useEffect(() => {
    remove(false)
  }, [pathname, search, month])
  useEffect(() => {
    if (!visible) return
    let live = true
    void (async () => {
      const result = await db!.from('assistant_conversations').select('id,title,updated_at').eq(
        'restaurant_id',
        restaurant.id,
      ).order('updated_at', { ascending: false })
      if (!live) return
      if (result.error) {
        fail('Conversation history unavailable. Retry loading.')
        return
      }
      setList(result.data)
      if (active && !result.data.some((c) => c.id === active)) {
        select('')
        sessionStorage.removeItem(storage)
      }
    })()
    return () => {
      live = false
    }
  }, [visible, restaurant.id, revision, active, storage])
  useEffect(() => {
    if (!visible || !active) {
      setTurns([])
      return
    }
    let live = true
    load(true)
    void (async () => {
      const result = await db!.from('assistant_turns').select('id,question,answer').eq(
        'conversation_id',
        active,
      ).order('created_at')
      if (live) {
        if (result.error) fail('Messages could not be loaded.')
        else setTurns(result.data)
        load(false)
      }
    })()
    return () => {
      live = false
    }
  }, [active, revision, visible])
  useEffect(() => {
    if (following.current && scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [turns, busy, full, open])
  function choose(id: string) {
    select(id)
    setTurns([])
    load(false)
    edit('')
    fail('')
    changeAction('')
    retry.current = null
    following.current = true
    showHistory(false)
    if (id) sessionStorage.setItem(storage, id)
    else sessionStorage.removeItem(storage)
  }
  async function send(text = draft) {
    const question = text.trim()
    if (locked.current || !question) return
    locked.current = true
    sending(true)
    fail('')
    following.current = true
    try {
      let cid = active
      if (!cid) {
        const created = await db!.from('assistant_conversations').insert({
          restaurant_id: restaurant.id,
          title: question.slice(0, 80),
        }).select('id,title,updated_at').single()
        if (!created.data) throw Error('Unable to create conversation.')
        cid = created.data.id
        select(cid)
        sessionStorage.setItem(storage, cid)
        setList((l) => [created.data, ...l])
      }
      const pending = retry.current?.text === question && retry.current.cid === cid
        ? retry.current
        : { id: crypto.randomUUID(), cid, text: question, scope: context?.scope ?? {} }
      retry.current = pending
      edit(question)
      const result = await db!.functions.invoke('chat-assistant', {
        body: {
          restaurantId: restaurant.id,
          conversationId: cid,
          requestId: pending.id,
          question,
          context: pending.scope,
        },
      })
      if (result.error) {
        const body = await result.error.context?.json?.().catch(() => null)
        throw Error(body?.error ?? 'Cannot reach the assistant. Please retry.')
      }
      retry.current = null
      edit('')
      refresh((r) => r + 1)
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Request failed.')
    } finally {
      locked.current = false
      sending(false)
    }
  }
  async function manage() {
    if (!active) return
    const table = db!.from('assistant_conversations'),
      result = await (action === 'delete' ? table.delete() : table.update({ title: title.trim() })).eq(
        'id',
        active,
      ).eq('restaurant_id', restaurant.id).select('id').single()
    if (result.error) {
      fail('Conversation could not be updated.')
      return
    }
    if (action === 'delete') choose('')
    changeAction('')
    refresh((n) => n + 1)
  }
  if (!full && !open) {
    return (
      <button
        className='assistantLauncher'
        hidden={menu}
        onClick={() => setOpen(true)}
      >
        Ask InvoiceEye
      </button>
    )
  }
  const current = list.find((c) => c.id === active)
  return (
    <section
      aria-label='Purchasing assistant'
      className={'assistantShell ' + (full ? 'fullChat' : 'floatChat')}
      hidden={!full && menu}
    >
      {full && (
        <div className={'chatHistory ' + (history ? 'show' : '')}>
          <button className='primary' disabled={busy} onClick={() => choose('')}>New chat</button>
          <h2>Conversations</h2>
          {list.map((c) => (
            <button
              disabled={busy}
              key={c.id}
              className={active === c.id ? 'current' : ''}
              onClick={() => choose(c.id)}
            >
              {c.title}
              <small>{new Date(c.updated_at).toLocaleString()}</small>
            </button>
          ))}
        </div>
      )}
      <div className='chatMain'>
        <div className='chatBar'>
          <strong>{current?.title ?? 'Purchasing assistant'}</strong>
          {full
            ? (
              <>
                <button className='mobileHistory' onClick={() => showHistory(!history)}>History</button>
                {active && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => {
                        setTitle(current?.title ?? '')
                        changeAction('rename')
                      }}
                    >
                      Rename
                    </button>
                    <button disabled={busy} onClick={() => changeAction('delete')}>Delete</button>
                  </>
                )}
              </>
            )
            : (
              <>
                <button
                  onClick={() => {
                    carry(context)
                    setOpen(false)
                    navigate('/ai-assistant')
                  }}
                >
                  Expand
                </button>
                <button aria-label='Minimize assistant' onClick={() => setOpen(false)}>−</button>
                <button aria-label='Close assistant' onClick={() => setOpen(false)}>×</button>
              </>
            )}
        </div>
        {action && (
          <form
            className='chatAction'
            onSubmit={(e) => {
              e.preventDefault()
              void manage()
            }}
          >
            {action === 'rename'
              ? (
                <input
                  aria-label='Conversation title'
                  value={title}
                  maxLength={100}
                  onChange={(e) => setTitle(e.target.value)}
                />
              )
              : <span>Delete this conversation and its messages?</span>}
            <button disabled={action === 'rename' && !title.trim()}>Confirm</button>
            <button type='button' onClick={() => changeAction('')}>Cancel</button>
          </form>
        )}
        <div
          className='chatScroll'
          ref={scroller}
          onScroll={(e) => {
            const el = e.currentTarget
            following.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64
          }}
        >
          {loading && active && !turns.length
            ? <p role='status'>Loading messages…</p>
            : turns.map((t) => (
              <article key={t.id}>
                <p className='chatQuestion'>{t.question}</p>
                <Evidence answer={t.answer} />
              </article>
            ))}
          {!turns.length && !loading && !busy && (
            <div className='chatEmpty'>
              <img src='/invoiceeye.svg' alt='' />
              <h2>Ask about your purchases</h2>
              {starters.map((s) => <button key={s} onClick={() => void send(s)}>{s}</button>)}
            </div>
          )}
          {busy && <p role='status'>Checking purchasing records…</p>}
        </div>
        {error && (
          <div className='chatError' role='alert'>
            {error}{' '}
            <button
              onClick={() => {
                if (retry.current) void send(retry.current.text)
                else {
                  fail('')
                  refresh((n) => n + 1)
                }
              }}
            >
              Retry
            </button>
          </div>
        )}
        <form
          className='chatComposer'
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          {context && (
            <button
              type='button'
              onClick={() => {
                remove(true)
                carry(null)
              }}
              aria-label={'Remove context ' + context.label}
            >
              {context.label} ×
            </button>
          )}
          <div>
            <textarea
              aria-label='Message'
              rows={2}
              maxLength={1600}
              disabled={busy}
              value={draft}
              placeholder='Ask a purchasing question…'
              onChange={(e) => edit(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void send()
                }
              }}
            />
            <button className='primary' disabled={busy || !draft.trim()}>Send</button>
          </div>
        </form>
      </div>
    </section>
  )
}
