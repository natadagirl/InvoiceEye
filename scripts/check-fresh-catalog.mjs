// Run with a temporary PGlite install. Every record exists only in this in-memory database.
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { analytics } from '../src/services/analytics.ts'
import { matchIngredient, proposeIngredient } from '../src/services/invoiceMatching.ts'
import { calculate } from '../supabase/functions/_shared/metrics.ts'
import { answerPurchases } from '../supabase/functions/chat-assistant/evidence.ts'
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite')
const db = new PGlite()
const query = async (sql, values = []) => (await db.query(sql, values)).rows
const scalar = async (sql, values = []) => Object.values((await query(sql, values))[0])[0]
const actor = crypto.randomUUID(), outsider = crypto.randomUUID()
async function asUser(id, run) {
  await db.exec('set role authenticated')
  await query("select set_config('request.jwt.claim.sub',$1,false)", [id])
  try {
    return await run()
  } finally {
    await db.exec('reset role')
  }
}
try {
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated;
    create schema storage;
    create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(bucket_id text,name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select,insert on storage.objects to authenticated;
  `)
  for (
    const file of [
      '20261123000100_purchasing.sql',
      '20261123000200_invoice_storage.sql',
      '20261123000300_invoice_review.sql',
      '20261123000400_finish_extraction.sql',
      '20261123000500_analysis_reports.sql',
      '20261127000100_confirm_invoice_ingredients.sql',
    ]
  ) {
    await db.exec(await readFile(new URL('../supabase/migrations/' + file, import.meta.url), 'utf8'))
  }
  await query('insert into auth.users values($1),($2)', [actor, outsider])
  const rid = await asUser(actor, () => scalar("select public.onboard_restaurant('Fresh synthetic kitchen')"))
  await asUser(outsider, () => scalar("select public.onboard_restaurant('Other synthetic kitchen')"))
  for (const table of ['suppliers', 'ingredients', 'invoices']) {
    assert.equal(await scalar('select count(*)::int from public.' + table + ' where restaurant_id=$1', [rid]), 0)
  }

  // Drive the actual storage trigger and worker claim/finish RPCs with a synthetic extraction response.
  let digest = 0
  async function upload(draft) {
    const iid = crypto.randomUUID()
    await asUser(
      actor,
      () => query("insert into storage.objects values('invoices',$1)", [rid + '/' + iid + '.pdf']),
    )
    const lease = await scalar('select public.claim_invoice_extraction($1,$2,$3)', [
      iid,
      actor,
      (++digest).toString(16).padStart(64, '0'),
    ])
    assert.equal(
      await scalar("select public.finish_invoice_extraction($1,$2,$3,'mock',null)", [
        iid,
        lease,
        JSON.stringify(draft),
      ]),
      true,
    )
    return iid
  }
  const catalog = () =>
    asUser(
      actor,
      () => query('select id,name,specification,base_unit from public.ingredients where restaurant_id=$1', [rid]),
    )
  const confirm = (iid, draft, user = actor) =>
    asUser(user, () => scalar('select public.confirm_invoice($1,$2)', [iid, JSON.stringify(draft)]))
  const line = (name, price, ingredientKind = 'food') => ({
    name,
    description: 'Original synthetic vendor description',
    ingredientKind,
    quantity: 1,
    unit: 'case',
    packageUnit: 'kg',
    packageSize: 5,
    unitPrice: price,
    lineTotal: price,
  })
  const invoice = (number, date, items) => {
    const total = items.reduce((sum, item) => sum + item.lineTotal, 0)
    return {
      number,
      date,
      items,
      supplier: 'Cold Start Produce',
      currency: 'CAD',
      subtotal: total,
      tax: 0,
      discounts: 0,
      total,
      warnings: [],
    }
  }
  const first = invoice('FIRST', '2026-10-19', [line('Bell Pepper', 20), line('Delivery fee', 4, 'charge')])
  const firstId = await upload(first)
  assert.deepEqual(await catalog(), [])
  assert.equal(await scalar('select count(*)::int from public.suppliers'), 0)
  const suggestion = proposeIngredient(first.items[0], matchIngredient('Bell Pepper', 'kg', []))
  assert.equal(suggestion, 'Bell Pepper')
  assert.equal(proposeIngredient(first.items[1], matchIngredient('Delivery fee', 'kg', [])), undefined)
  assert.equal(
    proposeIngredient(line('Item 238', 20, 'uncertain'), matchIngredient('Item 238', 'kg', [])),
    undefined,
  )
  const confirmedFirst = {
    ...first,
    items: [{ ...first.items[0], newIngredientName: suggestion }, first.items[1]],
  }
  await assert.rejects(confirm(firstId, confirmedFirst, outsider), /Invoice unavailable/)
  await confirm(firstId, confirmedFirst)
  await confirm(firstId, confirmedFirst)
  const [pepper] = await catalog()
  assert.equal(pepper.name, 'Bell Pepper')
  assert.equal(await scalar('select count(*)::int from public.suppliers'), 1)
  assert.equal(await scalar('select count(*)::int from public.invoice_items where invoice_id=$1', [firstId]), 2)
  const firstLine = (await query('select * from public.invoice_items where ingredient_id=$1', [pepper.id]))[0]
  assert.equal(firstLine.description, first.items[0].description)
  assert.equal(Number(firstLine.normalized_unit_price), 4)
  assert.equal(firstLine.unit, 'case')
  assert.equal(Number(firstLine.package_size), 5)

  const second = invoice('SECOND', '2026-11-19', [line('Peppers, Bell', 26)])
  const secondId = await upload(second)
  const match = matchIngredient(second.items[0].name, 'kg', await catalog())
  assert.equal(match.automatic?.id, pepper.id)
  await confirm(secondId, { ...second, items: [{ ...second.items[0], ingredientId: match.automatic.id }] })
  const purchases = await asUser(
    actor,
    () => scalar("select public.analysis_inputs($1,'2026-10-01','2026-11-30')", [rid]),
  )
  assert.equal(purchases.length, 2)
  assert.equal(purchases[0].amount, 24)
  assert.equal(purchases[1].lines[0].normalizedPrice, 5.2)
  const snapshot = calculate(purchases, '2026-11', 2, '2026-11-27')
  assert.equal(snapshot.changes.find((c) => c.ingredient === 'Bell Pepper').change, 30)
  const chat = answerPurchases(
    purchases,
    { topic: 'prices', from: '2026-11-01', through: '2026-11-27', baseline: '', ingredient: -1, supplier: -1 },
    '2026-11-27',
    pepper.id,
  )
  assert.ok(chat.rows.some((row) => row.includes('30.0%')))
  const reports = analytics(
    purchases.map((p) => ({
      ...p,
      lines: p.lines.map((i) => ({ ...i, normalizedPrice: i.normalizedPrice ?? 0 })),
    })),
  )
  const alerts = reports.comparisons('2026-11').filter((v) => v.delta !== null && v.delta >= 10)
  assert.ok(alerts.some((v) => v.ingredient === 'Bell Pepper' && Math.round(v.delta) === 30))
  assert.equal(
    (await asUser(outsider, () => query('select id from public.ingredients where restaurant_id=$1', [rid])))
      .length,
    0,
  )
  assert.deepEqual(
    await asUser(outsider, () => scalar("select public.analysis_inputs($1,'2026-10-01','2026-11-30')", [rid])),
    [],
  )

  const discarded = invoice('CANCELLED', '2026-11-20', [line('Discarded food', 5)])
  const cancelled = await upload(discarded)
  await asUser(actor, () => scalar('select public.discard_invoice($1)', [cancelled]))
  assert.equal((await catalog()).length, 1)
  const duplicate = invoice('DUPLICATES', '2026-11-21', [
    { ...line('Basil', 5), newIngredientName: 'Fresh Basil' },
    { ...line('Basil', 5), newIngredientName: 'Basil, Fresh' },
    { ...line('Basil', 5), packageUnit: 'each', newIngredientName: 'Fresh Basil' },
  ])
  const duplicateId = await upload(duplicate)
  await confirm(duplicateId, duplicate)
  const basils = (await catalog()).filter((row) => row.name.includes('Basil'))
  assert.equal(basils.length, 2)
  assert.equal(
    await scalar('select count(*)::int from public.invoice_items where invoice_id=$1 and ingredient_id=$2', [
      duplicateId,
      basils.find((b) => b.base_unit === 'kg').id,
    ]),
    2,
  )
  const invalid = invoice('ROLLBACK', '2026-11-22', [{
    ...line('Orphan test', 6),
    newIngredientName: 'Orphan test',
  }])
  const invalidId = await upload(invalid)
  await assert.rejects(
    confirm(invalidId, { ...invalid, supplier: 'Orphan supplier', subtotal: 9, total: 9 }),
    /totals do not reconcile/,
  )
  assert.equal(await scalar("select count(*)::int from public.ingredients where name='Orphan test'"), 0)
  assert.equal(await scalar("select count(*)::int from public.suppliers where name='Orphan supplier'"), 0)
  assert.equal(await scalar('select count(*)::int from public.invoice_items where invoice_id=$1', [invalidId]), 0)
  console.log(
    'Fresh catalog passed: upload trigger, extraction leases, atomic confirmation, matching, 30% price/alerts, Insights and Assistant evidence, cancellation, duplicate reuse, distinct units, rollback and tenant isolation.',
  )
} finally {
  await db.close()
}
