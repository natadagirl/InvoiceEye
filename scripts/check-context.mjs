// Opt-in live check. Appends verification turns to the demo user's own new test thread.
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { answerPurchases } from '../supabase/functions/chat-assistant/evidence.ts'
function ok(result) {
  if (result.error) throw Error(result.error.message)
  return result.data
}
async function connect(prefix) {
  const c = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  ok(
    await c.auth.signInWithPassword({
      email: process.env[prefix + '_EMAIL'],
      password: process.env[prefix + '_PASSWORD'],
    }),
  )
  return c
}
const demo = await connect('DEMO'), qa = await connect('QA')
const rid = ok(await demo.from('restaurants').select('id').eq('is_demo', true).single()).id
const cid = ok(
  await demo.from('assistant_conversations').insert({
    restaurant_id: rid,
    title: 'Verification · corrected price history',
  }).select('id').single(),
).id
const question = 'Which ingredient unit prices increased in October 2026 compared to September?'
async function ask(context) {
  const requestId = crypto.randomUUID()
  const r = await demo.functions.invoke('chat-assistant', {
    body: { restaurantId: rid, conversationId: cid, requestId, question, context },
  })
  if (r.error) throw Error((await r.error.context?.json())?.error ?? 'Assistant unavailable')
  return ok(await demo.from('assistant_turns').select('id,context,answer').eq('id', requestId).single())
}
const first = await ask({})
assert.equal(first.context.query.topic, 'prices')
const source = ok(await demo.rpc('analysis_inputs', { rid, first_day: '2026-10-01', last_day: '2026-11-30' }))
const target = source.find((r) =>
    r.date.startsWith('2026-11') && r.lines.some((l) => l.ingredient === 'Carrots')
  ),
  ingredientId = target.lines.find((l) => l.ingredient === 'Carrots').productKey
const scope = {
  turn: first.id,
  from: '2026-11-01',
  through: '2026-11-20',
  ingredientId,
  supplierId: target.supplierId,
}
const corrected = await ask(scope)
assert.equal(corrected.context.ingredientId, ingredientId)
assert.equal(corrected.context.supplierId, target.supplierId)
assert.equal(corrected.context.query.from, scope.from)
assert.equal(corrected.context.query.through, scope.through)
const expected = answerPurchases(
  source,
  corrected.context.query,
  '2026-11-25',
  ingredientId,
  target.supplierId,
)
assert.ok(expected.rows.length)
assert.deepEqual(corrected.answer.rows, expected.rows)
assert.equal(ok(await demo.from('assistant_turns').select('id').eq('conversation_id', cid)).length, 2)
const denied = await qa.functions.invoke('chat-assistant', {
  body: { restaurantId: rid, conversationId: cid, requestId: crypto.randomUUID(), question, context: scope },
})
assert.equal(denied.error?.context.status, 403)
console.log(
  'Live Gemini price question, corrected period/product/supplier, preserved original turn and QA denial passed.',
)
