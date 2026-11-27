import { useEffect, useRef, useState } from 'react'
import { db } from '../services/supabase'
import { useWorkspace } from '../services/analytics'
import {
  actionableNotes,
  type Draft,
  emptyDraft,
  emptyItem,
  isDraft,
  type Item,
  itemNumbers,
  lineProblems,
  problems,
} from '../../supabase/functions/extract-invoice/format'

import { ReviewSelector } from './ReviewSelector'
import { existingSupplier, type IngredientOption, matchIngredient } from '../services/invoiceMatching'
import './review.css'

type Product = IngredientOption
type ReviewLine = { key: string; automatic?: string; open: boolean }
function prepareDraft(draft: Draft, products: Product[]) {
  const lines = draft.items.map((item, index) => {
    const automatic = item.ingredientId === undefined
      ? matchIngredient(item.name, item.packageUnit, products).automatic?.id
      : undefined
    return {
      key: crypto.randomUUID(),
      automatic,
      open: !(automatic ?? item.ingredientId) || lineProblems(item, index).length > 0,
    }
  })
  return {
    lines,
    draft: {
      ...draft,
      items: draft.items.map((item, index) =>
        lines[index].automatic ? { ...item, ingredientId: lines[index].automatic } : item
      ),
    },
  }
}
type Props = { id: string; path: string; onClose: () => void }
const names: Record<string, string> = {
  supplier: 'Supplier',
  number: 'Invoice number',
  date: 'Invoice date',
  currency: 'Currency',
  subtotal: 'Subtotal',
  tax: 'Tax',
  discounts: 'Discounts',
  total: 'Total',
  name: 'Product name',
  description: 'Description',
  quantity: 'Quantity',
  unit: 'Purchased unit',
  packageSize: 'Pack size',
  packageUnit: 'Base unit',
  unitPrice: 'Unit price',
  lineTotal: 'Line total',
}
function AmountField(
  { value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string },
) {
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <input
      aria-label={label}
      type='number'
      step='any'
      value={editing ?? (value === null ? '' : value.toFixed(2))}
      onFocus={() => setEditing(value === null ? '' : String(value))}
      onBlur={() => setEditing(null)}
      onChange={(e) => {
        setEditing(e.target.value)
        onChange(e.target.value === '' ? null : Number(e.target.value))
      }}
    />
  )
}
export function Review({ id, path, onClose }: Props) {
  const { restaurant, refresh } = useWorkspace()
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft),
    [products, setProducts] = useState<Product[]>([]),
    [suppliers, setSuppliers] = useState<string[]>([])
  const [status, setStatus] = useState('uploaded'),
    [busy, setBusy] = useState('Loading invoice…'),
    [error, setError] = useState(''),
    [preview, setPreview] = useState('')
  const [lines, setLines] = useState<ReviewLine[]>([])
  const [dirty, setDirty] = useState(false)
  useEffect(() => {
    dialog.current?.showModal()
    let alive = true, url = ''
    async function load() {
      const [row, catalog, vendors, file] = await Promise.all([
        db!.from('invoices').select('extraction,extraction_error,processing_status').eq('id', id).eq(
          'restaurant_id',
          restaurant.id,
        ).single(),
        db!.from('ingredients').select('id,name,specification,base_unit').eq('restaurant_id', restaurant.id).order(
          'name',
        ),
        db!.from('suppliers').select('name').eq('restaurant_id', restaurant.id).order('name'),
        db!.storage.from('invoices').download(path, { cacheNonce: crypto.randomUUID() }, { cache: 'no-store' }),
      ])
      if (!alive) return
      if (row.error || catalog.error || vendors.error) {
        throw new Error('Could not load the invoice or matching catalog. Reopen to retry.')
      }
      setProducts(catalog.data)
      setSuppliers(vendors.data.map((v) => v.name))
      setStatus(row.data.processing_status)
      const storedError = row.data.extraction_error ?? ''
      setError(
        /^Gemini (request failed|model lookup failed)/i.test(storedError)
          ? 'AI extraction is temporarily unavailable. Please try again shortly.'
          : storedError,
      )
      const prepared = prepareDraft(
        isDraft(row.data.extraction) ? row.data.extraction : emptyDraft(),
        catalog.data,
      )
      setDraft(prepared.draft)
      setLines(prepared.lines)
      if (file.data) {
        url = URL.createObjectURL(
          path.endsWith('.pdf') ? new Blob([file.data], { type: 'application/pdf' }) : file.data,
        )
        setPreview(url)
      } else setError('File preview unavailable.')
    }
    load().catch((e) => {
      if (alive) setError(e.message)
    }).finally(() => {
      if (alive) setBusy('')
    })
    return () => {
      alive = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [id, path, restaurant.id])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  function change(next: Draft) {
    setDraft(next)
    setDirty(true)
  }
  function line(index: number, patch: Partial<Item>) {
    change({ ...draft, items: draft.items.map((i, k) => k === index ? { ...i, ...patch } : i) })
  }
  function close() {
    if (!busy && (!dirty || window.confirm('Close and lose your unsaved edits?'))) onClose()
  }
  async function run(action: 'extract' | 'confirm' | 'discard') {
    if (action === 'discard' && !window.confirm('Discard this draft? Its file will remain in your restaurant.')) {
      return
    }
    if (action === 'extract' && dirty && !window.confirm('Replace your edits with a new extraction?')) return
    setBusy(action === 'extract' ? 'Reading invoice with Gemini…' : 'Saving…')
    setError('')
    try {
      if (action === 'extract') {
        const { data, error } = await db!.functions.invoke('extract-invoice', { body: { invoiceId: id } })
        if (error) {
          const body = await error.context?.json?.().catch(() => null)
          throw new Error(body?.error ?? 'Extraction request failed. Retry when connected.')
        }
        if (!isDraft(data?.draft)) throw new Error('Invalid extraction response.')
        const prepared = prepareDraft(data.draft, products)
        setDraft(prepared.draft)
        setLines(prepared.lines)
        setStatus('awaiting_review')
        setDirty(false)
      } else {
        const result = action === 'confirm'
          ? await db!.rpc('confirm_invoice', {
            iid: id,
            draft: { ...draft, supplier: existingSupplier(draft.supplier ?? '', suppliers) ?? draft.supplier },
          })
          : await db!.rpc('discard_invoice', { iid: id })
        if (result.error) {
          throw new Error(
            result.error.code === '23505'
              ? 'This supplier and invoice number already exist.'
              : result.error.message,
          )
        }
        refresh()
        onClose()
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed.')
      if (action === 'extract') {
        const { data } = await db!.from('invoices').select('processing_status').eq('id', id).eq(
          'restaurant_id',
          restaurant.id,
        ).maybeSingle()
        if (data) setStatus(data.processing_status)
      }
    } finally {
      setBusy('')
    }
  }
  const issues = problems(draft)
  draft.items.forEach((item, index) => {
    const matched = products.find((p) => p.id === item.ingredientId)
    if (matched && matched.base_unit !== item.packageUnit) {
      issues.push(
        'Row ' + (index + 1) + ' must express the pack size in ' + matched.base_unit + ' for ' + matched.name +
          '.',
      )
    }
  })
  const editable = ['awaiting_review', 'failed'].includes(status)
  const notes = actionableNotes(draft.warnings)
  const supplier = existingSupplier(draft.supplier ?? '', suppliers)
  const supplierOptions = suppliers.map((name) => ({ value: name, label: name, note: 'Existing supplier' }))
  const setOpen = (key: string, open: boolean) =>
    setLines((current) => current.map((row) => row.key === key ? { ...row, open } : row))
  const textField = (key: 'number' | 'date' | 'currency') => (
    <label>
      {names[key]}
      <input
        type={key === 'date' ? 'date' : 'text'}
        value={draft[key] ?? ''}
        onChange={(event) => change({ ...draft, [key]: event.target.value || null })}
      />
    </label>
  )
  const amountField = (key: 'subtotal' | 'tax' | 'discounts' | 'total') => (
    <label>
      {key === 'total' ? 'Invoice total' : names[key]}
      <AmountField
        label={key === 'total' ? 'Invoice total' : names[key]}
        value={draft[key]}
        onChange={(value) => change({ ...draft, [key]: value })}
      />
    </label>
  )
  const extractLabel = editable || status === 'processing' ? 'Retry extraction' : 'Extract with Gemini'

  return (
    <dialog
      className='review'
      ref={dialog}
      aria-labelledby='review-heading'
      onCancel={(e) => {
        e.preventDefault()
        close()
      }}
    >
      <div className='panelHead'>
        <div>
          <h2 id='review-heading'>Review invoice</h2>
          <p>{status.replaceAll('_', ' ')} · {restaurant.name}</p>
        </div>
        <button disabled={!!busy} onClick={close}>Close</button>
      </div>
      <div className='reviewBody'>
        <div className='originalPane'>
          {preview && (
            <details open>
              <summary>Original invoice</summary>
              {path.endsWith('.pdf')
                ? <iframe title='Original PDF' src={preview} />
                : <img alt='Original supplier invoice' src={preview} />}
              <a href={preview} download={path.split('/').pop()}>Download original</a>
            </details>
          )}
        </div>
        <div className='editPane'>
          <div className='reviewSectionHead'>
            <h3>Invoice details</h3>
            <button className='outline' disabled={!!busy} onClick={() => run('extract')}>{extractLabel}</button>
          </div>
          {busy && <p role='status'>{busy}</p>}
          {error && <p className='reviewError' role='alert'>{error}</p>}
          {editable && (
            <fieldset aria-label='Extracted invoice fields' disabled={!!busy}>
              <div className='invoiceHeaderFields'>
                <ReviewSelector
                  label='Supplier'
                  selected={supplier ?? draft.supplier ?? 'Choose or add a supplier'}
                  options={supplierOptions}
                  allowNew
                  onSelect={(value) => change({ ...draft, supplier: value })}
                />
                {draft.supplier && !supplier && (
                  <small>This supplier name will be checked and saved when you confirm.</small>
                )}
                <div className='invoiceFieldPair'>{textField('number')}{textField('date')}</div>
                <div className='invoiceFieldPair'>
                  {textField('currency')}
                  {amountField('subtotal')}
                  {amountField('tax')}
                  {amountField('discounts')}
                </div>
                <div className='invoiceTotalField'>{amountField('total')}</div>
              </div>
              <div className='reviewSectionHead'>
                <h3>Line items</h3>
                {lines.length > 1 && (
                  <div className='reviewBulkActions'>
                    <button type='button' onClick={() => setLines(lines.map((row) => ({ ...row, open: true })))}>
                      Expand all
                    </button>
                    <button type='button' onClick={() => setLines(lines.map((row) => ({ ...row, open: false })))}>
                      Collapse all
                    </button>
                  </div>
                )}
              </div>
              {draft.items.map((item, index) => {
                const state = lines[index]
                if (!state) return null
                const match = products.find((product) => product.id === item.ingredientId)
                const recommendation = matchIngredient(item.name, item.packageUnit, products)
                const suggestedIds = new Set(recommendation.suggested.map((product) => product.id))
                if (recommendation.automatic) suggestedIds.add(recommendation.automatic.id)
                const options = products.map((product) => ({
                  value: product.id,
                  label: product.name + ' · ' + product.specification + ' / ' + product.base_unit,
                  note: suggestedIds.has(product.id) && product.id !== item.ingredientId
                    ? 'Suggested match'
                    : undefined,
                })).sort((a, b) => Number(Boolean(b.note)) - Number(Boolean(a.note)))
                const warnings = lineProblems(item, index)
                if (match && match.base_unit !== item.packageUnit) {
                  warnings.push('Pack size must use ' + match.base_unit + ' for ' + match.name + '.')
                }
                const matchingStatus = match
                  ? item.ingredientId === state.automatic ? 'Automatic match' : 'Selected match'
                  : suggestedIds.size
                  ? 'Suggested match available'
                  : 'Unmatched'
                return (
                  <section className='reviewLine' key={state.key}>
                    <button
                      className='reviewLineSummary'
                      type='button'
                      aria-expanded={state.open}
                      aria-controls={'line-' + state.key}
                      onClick={() => setOpen(state.key, !state.open)}
                    >
                      <span>
                        <small>
                          Line {index + 1} · {matchingStatus}
                          {warnings.length ? ' · Needs review' : ''}
                        </small>
                        <strong>{item.name || 'Unnamed product'}</strong>
                      </span>
                      <span className='reviewLinePrices'>
                        <small>
                          {item.quantity ?? '—'} {item.unit ?? ''} · Unit {item.unitPrice?.toFixed(2) ?? '—'}
                        </small>
                        <strong>Total {item.lineTotal?.toFixed(2) ?? '—'}</strong>
                      </span>
                      <span aria-hidden='true'>{state.open ? '−' : '+'}</span>
                    </button>
                    {state.open && (
                      <div className='reviewLineFields' id={'line-' + state.key}>
                        <label>
                          Product name<textarea
                            value={item.name ?? ''}
                            rows={2}
                            onChange={(e) => line(index, { name: e.target.value || null })}
                          />
                        </label>
                        <ReviewSelector
                          label={'Ingredient match row ' + (index + 1)}
                          selected={match ? match.name + ' · ' + match.specification : 'Leave unmatched'}
                          options={options}
                          alternative={{ value: '', label: 'Leave unmatched' }}
                          onSelect={(value) => {
                            setLines((current) =>
                              current.map((row) => row.key === state.key ? { ...row, automatic: undefined } : row)
                            )
                            line(index, { ingredientId: value })
                          }}
                        />
                        <label>
                          Description<textarea
                            rows={2}
                            value={item.description ?? ''}
                            onChange={(e) => line(index, { description: e.target.value || null })}
                          />
                        </label>
                        <div className='invoiceFieldPair'>
                          {(['unit', 'packageUnit'] as const).map((k) => (
                            <label key={k}>
                              {names[k]}
                              <input
                                value={item[k] ?? ''}
                                onChange={(e) => line(index, { [k]: e.target.value || null })}
                              />
                            </label>
                          ))}
                          {itemNumbers.map((k) => (
                            <label key={k}>
                              {names[k]}
                              {k === 'lineTotal' || k === 'unitPrice'
                                ? (
                                  <AmountField
                                    label={names[k] + ' row ' + (index + 1)}
                                    value={item[k]}
                                    onChange={(v) => line(index, { [k]: v })}
                                  />
                                )
                                : (
                                  <input
                                    type='number'
                                    step='any'
                                    value={item[k] ?? ''}
                                    onChange={(e) =>
                                      line(index, { [k]: e.target.value === '' ? null : Number(e.target.value) })}
                                  />
                                )}
                            </label>
                          ))}
                        </div>
                        <button
                          type='button'
                          onClick={() => {
                            setLines((current) => current.filter((row) => row.key !== state.key))
                            change({ ...draft, items: draft.items.filter((_, n) => n !== index) })
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </section>
                )
              })}
              <button
                className='outline'
                disabled={draft.items.length >= 200}
                onClick={() => {
                  setLines([...lines, { key: crypto.randomUUID(), open: true }])
                  change({ ...draft, items: [...draft.items, emptyItem()] })
                }}
              >
                Add line item
              </button>
              {notes.length > 0 && (
                <div className='reviewNotes'>
                  <strong>Extractor notes</strong>
                  {notes.map((note) => <p key={note}>{note}</p>)}
                </div>
              )}
              {issues.length > 0 && (
                <div className='reviewNotes' id='invoice-review-issues'>
                  <strong>Before confirmation</strong>
                  {issues.map((issue) => <p key={issue}>{issue}</p>)}
                </div>
              )}
            </fieldset>
          )}
        </div>
      </div>
      <div className='reviewActions reviewFooter'>
        <button disabled={!!busy} onClick={() => run('discard')}>Discard draft</button>
        {editable && (
          <button
            className='primary'
            disabled={!!busy || issues.length > 0}
            aria-describedby={issues.length ? 'invoice-review-issues' : undefined}
            onClick={() => run('confirm')}
          >
            Confirm and save
          </button>
        )}
      </div>
    </dialog>
  )
}
