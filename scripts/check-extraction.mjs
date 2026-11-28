// Uses the dedicated QA restaurant. Replays reuse extracted records to avoid extra Gemini calls.
import {createClient} from '@supabase/supabase-js'
import {readFileSync} from 'node:fs'
import {createHash,randomUUID} from 'node:crypto'
import assert from 'node:assert/strict'
import {analytics} from '../src/services/analytics.ts'
import {isDraft,problems} from '../supabase/functions/extract-invoice/format.ts'
const client=()=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const qa=client(),outsider=client()
function ok(r){if(r.error)throw new Error(r.error.message);return r.data}
for(const [c,prefix] of [[qa,'QA'],[outsider,'DEMO']])ok(await c.auth.signInWithPassword({email:process.env[prefix+'_EMAIL'],password:process.env[prefix+'_PASSWORD']}))
const rid=ok(await qa.from('restaurants').select('id').eq('name','InvoiceEye isolation check').single()).id
async function request(c,id){
 const {data,error}=await c.functions.invoke('extract-invoice',{body:{invoiceId:id}})
 if(error)return {status:error.context?.status,error:(await error.context?.json?.().catch(()=>null))?.error??error.message}
 return {status:200,...data}
}
async function upload(bytes,ext,type){
 const id=randomUUID()
 ok(await qa.storage.from('invoices').upload(rid+'/'+id+'.'+ext,new Blob([bytes],{type}),{cacheControl:'0'}))
 return id
}
const financial=async()=>analytics(ok(await qa.from('invoices').select('invoice_date,total_amount,processing_status,currency').eq('restaurant_id',rid)).map(i=>({date:i.invoice_date,amount:i.total_amount,status:i.processing_status,currency:i.currency}))).monthlySpend('2026-12')
for(const [file,type,amount] of [['normal.pdf','application/pdf',103.8],['increase.png','image/png',150.5]]){
 const bytes=readFileSync('scripts/fixtures/invoices/'+file),hash=createHash('sha256').update(bytes).digest('hex')
 const existing=ok(await qa.from('invoices').select('id,extraction,extraction_model,processing_status').eq('restaurant_id',rid).eq('file_hash',hash).neq('processing_status','discarded').maybeSingle())
 const id=existing?.id??await upload(bytes,file.split('.')[1],type)
 const before=await financial()
 assert.equal((await request(outsider,id)).status,404)
 assert.ok((await outsider.rpc('confirm_invoice',{iid:id,draft:{}})).error)
 let draft=existing?.extraction,model=existing?.extraction_model
 if(!draft){
  const response=await request(qa,id)
  if(response.status!==200)throw new Error(file+' extraction: '+response.status+' '+response.error)
  draft=response.draft;model=response.model
 }
 assert.ok(isDraft(draft));assert.equal(draft.total,amount);assert.equal(draft.items.length,2)
 assert.equal(draft.supplier,'Cedar Valley Produce')
 assert.equal(await financial(),before)
 if(existing?.processing_status!=='ready'){
  // Simulate a human amending description and explicitly resolving any absent zero or pack values from the fixture.
  draft.items[0].description='Reviewed synthetic produce delivery'
  draft.items.forEach(i=>{i.packageSize=5;i.packageUnit='kg'})
  draft.tax=0;draft.discounts=0
  assert.deepEqual(problems(draft),[])
  const invalid=await qa.rpc('confirm_invoice',{iid:id,draft:{...draft,total:amount+4}})
  assert.ok(invalid.error);assert.equal(ok(await qa.from('invoice_items').select('id').eq('invoice_id',id)).length,0)
  if(file==='increase.png'){
   const duplicate=await qa.rpc('confirm_invoice',{iid:id,draft:{...draft,number:' cv-syn-241 '}})
   assert.equal(duplicate.error?.code,'23505')
  }
  const first=ok(await qa.rpc('confirm_invoice',{iid:id,draft}))
  assert.equal(ok(await qa.rpc('confirm_invoice',{iid:id,draft})),first)
  assert.equal(Math.round((await financial()-before)*100),Math.round(amount*100))
 }
 const stored=ok(await qa.from('invoice_items').select('description,unit_price,normalized_unit_price,package_size').eq('invoice_id',id))
 assert.equal(stored.length,2);assert.ok(stored.some(i=>i.description==='Reviewed synthetic produce delivery'))
 assert.ok(stored.every(i=>Math.abs(i.normalized_unit_price-i.unit_price/i.package_size)<0.000001))
 console.log(file,model,'validated lines:',draft.items.length,'total CAD:',amount)
 if(file==='normal.pdf'){
  const duplicate=await upload(bytes,'pdf',type)
  try{assert.equal((await request(qa,duplicate)).status,409)}finally{ok(await qa.rpc('discard_invoice',{iid:duplicate}))}
 }
}
console.log('Passed tenant denial, duplicate hash, atomic rollback, idempotent confirmation, normalized prices and confirmed-only dashboard spend.')
// This sample tests an intentionally absent pack size. Leave it available for human review.
const jpeg=readFileSync('scripts/fixtures/invoices/incomplete.jpg')
const existingJpeg=ok(await qa.from('invoices').select('id,extraction,extraction_model').eq('restaurant_id',rid).eq('file_hash',createHash('sha256').update(jpeg).digest('hex')).neq('processing_status','discarded').maybeSingle())
const jid=existingJpeg?.id??await upload(jpeg,'jpg','image/jpeg')
const extraction=existingJpeg?.extraction?{draft:existingJpeg.extraction,model:existingJpeg.extraction_model}:await request(qa,jid)
assert.ok(isDraft(extraction.draft),extraction.error)
const missing=extraction.draft.items.find(i=>i.name?.toLowerCase().includes('tomato'))
assert.equal(missing?.packageSize,null)
assert.equal(extraction.draft.total,157.14)
assert.ok(problems(extraction.draft).length>0)
console.log('incomplete.jpg',extraction.model,'total CAD 157.14; missing tomato pack size preserved as null and flagged for review.')
