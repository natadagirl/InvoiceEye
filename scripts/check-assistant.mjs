// Opt-in synthetic live test. Creates one private history thread, preserving it for review.
import assert from 'node:assert/strict'
import {createClient} from '@supabase/supabase-js'
import {answerPurchases} from '../supabase/functions/chat-assistant/evidence.ts'
const ok=r=>{if(r.error)throw Error(r.error.message);return r.data}
async function login(key){const c=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});ok(await c.auth.signInWithPassword({email:process.env[key+'_EMAIL'],password:process.env[key+'_PASSWORD']}));return c}
const demo=await login('DEMO'),qa=await login('QA')
const rid=ok(await demo.from('restaurants').select('id').eq('is_demo',true).single()).id
const cid=ok(await demo.from('assistant_conversations').insert({restaurant_id:rid,title:'Verification · October purchasing'}).select('id').single()).id
const inputs=ok(await demo.rpc('analysis_inputs',{rid,first_day:'2026-06-01',last_day:'2026-12-31'}))
const q={topic:'prices',from:'2026-12-01',through:'2026-12-31',baseline:'2026-11',ingredient:-1,supplier:-1}
const historic=answerPurchases(inputs,q,'2026-12-31'),scenario=answerPurchases(inputs,{...q,topic:'savings'},'2026-12-31')
assert.ok(historic.rows.some(r=>r[0].includes('Carrots')&&r[1]==='46.4%'));assert.ok(historic.rows.some(r=>r[0].includes('Roma tomatoes')&&r[1]==='43.9%'))
assert.ok(scenario.rows.some(r=>r[0].includes('Roma tomatoes')&&r[3]==='CAD 26.07'))
assert.equal(answerPurchases(inputs,q,'2026-11-25').rows.length,0)
const body={restaurantId:rid,conversationId:cid,requestId:crypto.randomUUID(),question:'What was my total purchasing expenditure across all suppliers in October 2026?'}
const invoke=(c,b)=>c.functions.invoke('chat-assistant',{body:b})
assert.equal(ok(await qa.from('assistant_conversations').select('id').eq('id',cid)).length,0)
assert.equal((await invoke(qa,body)).error?.context.status,403)
async function ask(body){const r=await invoke(demo,body);if(r.error)throw Error('Assistant failed: '+(await r.error.context?.json())?.error);return ok(await demo.from('assistant_turns').select('answer,context').eq('id',body.requestId).single()).answer}
const spend=await ask(body),oct=inputs.filter(r=>r.currency==='CAD'&&r.date.startsWith('2026-10'))
const sum=oct.reduce((a,r)=>a+r.amount,0)
assert.deepEqual(spend.rows,[[String(oct.length),'CAD '+sum.toFixed(2)]])
const suppliers=new Map();for(const r of oct)suppliers.set(r.supplier,(suppliers.get(r.supplier)??0)+r.amount)
const [name,total]=[...suppliers].sort((a,b)=>b[1]-a[1])[0]
const follow=await ask({...body,requestId:crypto.randomUUID(),question:'For that same period, show supplier spending concentration.'})
assert.deepEqual(follow.rows[0],[name,'CAD '+total.toFixed(2),(100*total/sum).toFixed(1)+'%'])
await ask(body);assert.equal(ok(await demo.from('assistant_turns').select('id').eq('conversation_id',cid)).length,2)
assert.equal(ok(await qa.from('assistant_turns').select('id').eq('conversation_id',cid)).length,0)
console.log('Live Gemini spend and contextual follow-up:',spend.period,spend.rows[0],follow.rows[0])
console.log('Verified cross-tenant denial, replay, persisted turns, December sample price changes, tomato scenario, and future exclusion.')
