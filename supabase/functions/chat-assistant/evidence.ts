import { calculate, offset, type Purchase } from '../_shared/metrics.ts'
export const topics = [
  'spend',
  'trend',
  'concentration',
  'prices',
  'comparison',
  'volume',
  'savings',
  'recommend',
  'report',
  'invoice',
  'unsupported',
] as const
export type Query = {
  topic: typeof topics[number]
  from: string
  through: string
  baseline: string
  ingredient: number
  supplier: number
}
export type Ref = { label: string; href: string }
export type Answer = {
  heading: string
  period: string
  columns: string[]
  rows: string[][]
  notes: string[]
  sources: Ref[]
  recommendation?: string
}
const money = (n: number) => 'CAD ' + n.toFixed(2)
const day = (v: unknown): v is string =>
  typeof v === 'string' && /^20\d\d-\d\d-\d\d$/.test(v) && !isNaN(Date.parse(v)) &&
  new Date(v).toISOString().startsWith(v)
export function validQuery(q: Query, ingredients: number, suppliers: number) {
  return q && topics.includes(q.topic) && day(q.from) && day(q.through) && q.from <= q.through &&
    q.from.slice(0, 7) >= offset(q.through.slice(0, 7), -11) &&
    (q.baseline === '' ||
      (/^20\d\d-(0[1-9]|1[0-2])$/.test(q.baseline) && q.baseline <= q.through.slice(0, 7))) &&
    [[q.ingredient, ingredients], [q.supplier, suppliers]].every(([i, length]) =>
      Number.isInteger(i) && i >= -1 && i < length
    )
}
// Explicitly named products can share a question. Keep exact catalog identities in comparisons.
export function namedProducts(question: string, catalog: { id: string; name: string }[]) {
  const terms = (s: string) =>
    s.toLowerCase().match(/[a-z]+/g)?.map((w) => w.replace(/toes$/, 'to').replace(/s$/, '')) ?? []
  const words = new Set(terms(question))
  return catalog.filter((p) => terms(p.name).some((word) => word.length >= 4 && words.has(word))).map((p) =>
    p.id
  )
}
export function answerPurchases(
  records: Purchase[],
  q: Query,
  asOf: string,
  ingredient?: string | string[],
  supplier?: string,
  invoice?: string,
): Answer {
  const start = q.from.slice(0, 7), end = q.through.slice(0, 7)
  const months = (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5)) -
    Number(start.slice(5)) + 1
  const eligible = records.filter((r) =>
    r.status === 'ready' && r.currency === 'CAD' && r.date <= asOf &&
    (!supplier || r.supplierId === supplier) && (!invoice || r.uuid === invoice)
  )
  const selected = eligible.filter((r) => r.date >= q.from && r.date <= q.through)
  const futureCount =
    records.filter((r) =>
      r.status === 'ready' && r.currency === 'CAD' && r.date > asOf && r.date >= q.from &&
      r.date <= q.through && (!supplier || r.supplierId === supplier) && (!invoice || r.uuid === invoice)
    ).length
  const scope = [...eligible.filter((r) => r.date < start + '-01'), ...selected]
  const s = calculate(scope, end, months, asOf)
  const source = '/invoices?' +
    new URLSearchParams({
      from: start,
      through: end,
      ...(supplier ? { supplierId: supplier } : {}),
      since: q.from,
      until: q.through < asOf ? q.through : asOf,
      ...(invoice ? { invoice } : {}),
    })
  const a: Answer = {
    heading: 'Purchasing expenditure',
    period: q.from + ' through ' + q.through,
    columns: [],
    rows: [],
    notes: [
      'Confirmed CAD purchases through ' + asOf +
      ' (Edmonton). Drafts and later invoices are excluded. Recorded expenditure includes header taxes and discounts.',
    ],
    sources: [],
  }
  if (futureCount) a.notes.push(futureCount + ' future-dated confirmed invoice(s) excluded from this period.')
  if (q.from <= asOf && q.through >= asOf) {
    a.notes.push('Open reporting period: figures are month-to-date through ' + asOf + '.')
  } else if (q.through < asOf) {
    a.notes.push('The reporting period has ended. The restaurant may have unrecorded deliveries.')
  }
  function row(values: string[], href = source, label = 'View confirmed invoices') {
    if (a.rows.length >= 12) return
    a.rows.push(values)
    if (!a.sources.some((r) => r.href === href)) a.sources.push({ href, label })
  }
  if (q.topic === 'unsupported' || q.topic === 'report') {
    a.heading = 'Insufficient evidence'
    a.notes = [
      'This question needs information outside the available purchasing records. Revenue, profit, market quotes and causes of supplier decisions are unavailable.',
    ]
    return a
  }
  if (ingredient && ['spend', 'trend', 'concentration', 'invoice'].includes(q.topic)) {
    a.heading = 'Ingredient spending needs line-level scope'
    a.notes.push(
      'Invoice totals include other ingredients. Ask about unit prices, volume or historical savings for this ingredient.',
    )
    return a
  }
  if (!selected.length) {
    a.heading = 'No confirmed purchases in this period'
    return a
  }
  const itemLink = (key: string) => '/price-tracker?' + new URLSearchParams({ month: end, item: key })
  const matches = (x: { product: string }) =>
    !ingredient || (Array.isArray(ingredient) ? ingredient.includes(x.product) : x.product === ingredient)
  if (q.topic === 'spend' || q.topic === 'invoice') {
    a.columns = ['Confirmed invoices', 'Expenditure']
    row([String(selected.length), money(s.coverage.total)])
  } else if (q.topic === 'trend') {
    a.heading = 'Monthly purchasing trend'
    a.columns = ['Month', 'Invoices', 'Expenditure']
    for (const m of s.monthly) row([m.month, String(m.count), money(m.spend)])
  } else if (q.topic === 'concentration') {
    a.heading = 'Supplier spending concentration'
    a.columns = ['Supplier', 'Expenditure', 'Share of period']
    for (const d of s.drivers) {
      row(
        [d.supplier, money(d.spend), d.share.toFixed(1) + '%'],
        source + '&supplier=' + encodeURIComponent(d.supplier),
        d.supplier + ' invoices',
      )
    }
  } else if (q.topic === 'comparison') {
    a.heading = 'Comparable recorded prices'
    a.columns = ['Ingredient and specification', 'Supplier', 'Weighted price']
    for (const g of s.prices.filter(matches).sort((a, b) => a.price - b.price)) {
      row(
        [g.ingredient + ' · ' + g.spec, g.supplier, money(g.price) + '/' + g.unit],
        itemLink(g.key),
        g.ingredient + ' · ' + g.supplier,
      )
    }
    a.notes.push('Compare identical specifications and units. Recorded prices are historical observations.')
  } else if (q.topic === 'savings') {
    a.heading = 'Historical savings scenario'
    a.columns = ['Ingredient · supplier', 'Baseline price', 'Recorded quantity', 'Estimated saving']
    const base = q.baseline || offset(end, -1), historical = calculate(eligible, base, 1, asOf).prices
    for (const g of s.prices.filter(matches)) {
      const b = historical.find((v) => v.key === g.key)
      if (b) {
        row(
          [
            g.ingredient + ' · ' + g.supplier,
            money(b.price) + '/' + g.unit,
            g.quantity + ' ' + g.unit,
            money(Math.max(0, g.price - b.price) * g.quantity),
          ],
          itemLink(g.key),
          g.ingredient + ' price history',
        )
      }
    }
    a.notes.push(
      'Applies ' + base +
        ' weighted prices to ending-month quantities at the same supplier. Availability and future savings are uncertain.',
    )
  } else {
    a.heading = q.topic === 'volume' ? 'Purchasing volume changes' : 'Ingredient unit-price changes'
    a.columns = ['Ingredient · supplier', 'Unit-price change', 'Price effect', 'Volume effect']
    for (const g of s.changes.filter(matches).sort((a, b) => b.change - a.change)) {
      row(
        [
          g.ingredient + ' · ' + g.supplier,
          g.change.toFixed(1) + '%',
          money(g.priceEffect),
          money(g.volumeEffect),
        ],
        itemLink(g.key),
        g.ingredient + ' · ' + g.supplier,
      )
    }
    a.notes.push(
      'Ending-month observed quantities and weighted prices compared with ' + offset(end, -1) +
        '. Partial months may contain fewer deliveries. Effects cover matched lines before header adjustments.',
    )
    if (q.topic === 'recommend' && s.changes.filter(matches).some((g) => g.priceEffect > 0)) {
      a.recommendation =
        'Review the increases above with the supplier. Confirm pack sizes and current quotes before changing orders.'
    }
  }
  if (selected.length === 1 && a.rows.length && !invoice) {
    a.sources.push({
      label: 'Open invoice record',
      href: '/invoices?' +
        new URLSearchParams({ month: selected[0].date.slice(0, 7), invoice: selected[0].uuid }),
    })
  }
  if (!a.rows.length) {
    a.notes.push('Insufficient comparable records for the selected ingredient, supplier or baseline.')
  }
  return a
}
