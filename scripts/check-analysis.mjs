import assert from 'node:assert/strict'
import {createClient} from '@supabase/supabase-js'
import {calculate} from '../supabase/functions/_shared/metrics.ts'
import {validatePlan} from '../supabase/functions/_shared/analysis-plan.ts'
function ok(r){if(r.error)throw Error(r.error.message);return r.data}
const connect=async prefix=>{const c=createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});ok(await c.auth.signInWithPassword({email:process.env[prefix+'_EMAIL'],password:process.env[prefix+'_PASSWORD']}));return c}
const demo=await connect('DEMO'),qa=await connect('QA')
const rid=ok(await demo.from('restaurants').select('id').eq('is_demo',true).single()).id
const invoke=(c,end)=>c.functions.invoke('generate-analysis',{body:{restaurantId:rid,end,months:12}})
assert.equal((await invoke(qa,'2026-12')).error?.context.status,403)
assert.equal((await invoke(demo,'2021-12')).error?.context.status,422)
const generated=await invoke(demo,'2026-12')
if(generated.error)throw Error('Generation failed: '+JSON.stringify(await generated.error.context?.json()))
const {id,report}=generated.data
const source=ok(await demo.rpc('analysis_inputs',{rid,first_day:'2025-12-01',last_day:'2026-12-31'}))
const s=calculate(source,'2026-12',12,report.snapshot.asOf)
assert.deepEqual(report.snapshot,s)
assert.ok(validatePlan(report.ai,s.facts,s.limitations.map((_,i)=>'l'+i)))
const amounts=ok(await demo.from('invoices').select('invoice_number,total_amount').eq('restaurant_id',rid).eq('processing_status','ready').eq('currency','CAD').gte('invoice_date','2026-01-01').lte('invoice_date','2026-12-31'))
assert.equal(amounts.length,s.coverage.count)
assert.equal(Math.round(amounts.reduce((n,i)=>n+i.total_amount,0)*100),Math.round(s.coverage.total*100))
assert.ok(amounts.some(i=>i.total_amount===150.5))
assert.equal(s.changes.find(x=>x.ingredient==='Carrots')?.change.toFixed(1),'46.4')
assert.equal(s.changes.find(x=>x.ingredient==='Roma tomatoes')?.change.toFixed(1),'43.9')
const saved=ok(await demo.from('ai_reports').select('report').eq('id',id).single())
assert.deepEqual(saved.report,report)
assert.equal(ok(await qa.from('ai_reports').select('id').eq('id',id)).length,0)
console.log(JSON.stringify({model:report.model,id,count:s.coverage.count,total:s.coverage.total,dates:[s.coverage.first,s.coverage.last],future:s.coverage.future,changes:s.changes.map(x=>[x.ingredient,x.change,x.priceEffect,x.volumeEffect]),recommendations:report.ai.recommendations.map(r=>({...r,evidence:s.facts.find(f=>f.id===r.metric).evidence}))},null,2))
await demo.auth.signOut();await qa.auth.signOut()
