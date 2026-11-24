import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const client=()=>createClient(process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const a=client(), b=client()
function ok(result){if(result.error)throw new Error(result.error.message);return result.data}
for(const [c,prefix] of [[a,'DEMO'],[b,'QA']]){
 ok(await c.auth.signInWithPassword({email:process.env[prefix+'_EMAIL'],password:process.env[prefix+'_PASSWORD']}))
 ok(await c.auth.refreshSession())
}
const own=ok(await a.from('restaurants').select('id').eq('is_demo',true).single()).id
const other=ok(await b.rpc('onboard_restaurant',{restaurant_name:'InvoiceEye isolation check'}))
assert.equal(other,ok(await b.rpc('onboard_restaurant',{restaurant_name:'InvoiceEye isolation check'})))
assert.notEqual(own,other)
for(const table of ['restaurants','restaurant_members','suppliers','ingredients','invoices','invoice_items','price_alerts','ai_reports']){
 const col=table==='restaurants'?'id':'restaurant_id'
 assert.equal(ok(await b.from(table).select('*').eq(col,own)).length,0)
}
assert.equal(ok(await a.from('restaurants').select('id').eq('id',other)).length,0)
const aUser=ok(await a.auth.getUser()).user.id
assert.equal(ok(await b.from('profiles').select('id').eq('id',aUser)).length,0)
const invoices=ok(await a.from('invoices').select('id').eq('restaurant_id',own).eq('processing_status','ready'))
assert.equal(invoices.length,90)
assert.equal(ok(await a.from('ingredients').select('id').eq('restaurant_id',own)).length,30)
assert.equal(ok(await a.from('suppliers').select('id').eq('restaurant_id',own)).length,5)
assert.equal(ok(await a.from('invoice_items').select('id').eq('restaurant_id',own)).length,630)
const demonstration=ok(await a.from('invoices').select('id,suppliers(name),invoice_items(quantity,package_size,normalized_unit_price,ingredients(name,base_unit,specification))').eq('restaurant_id',own).eq('processing_status','ready').limit(1))
assert.ok(demonstration[0].invoice_items[0].ingredients.base_unit)
const bucket=b.storage.from('invoices'),foreignBucket=a.storage.from('invoices')
const path=other+'/'+randomUUID()+'.pdf'
const fixture=new Blob(['%PDF-1.4\n% InvoiceEye synthetic transfer fixture\n%%EOF'],{type:'application/pdf'})
ok(await bucket.upload(path,fixture,{cacheControl:'0'}))
try{
 const downloaded=ok(await bucket.download(path))
 assert.equal(await downloaded.text(),await fixture.text())
 assert.ok((await foreignBucket.download(path)).error)
 assert.ok((await foreignBucket.upload(other+'/'+randomUUID()+'.pdf',fixture)).error)
 const denied=await foreignBucket.remove([path])
 assert.ok(denied.error||!denied.data.length)
 ok(await bucket.download(path))
 assert.equal(ok(await b.from('invoices').select('processing_status').eq('original_file_path',path).single()).processing_status,'uploaded')
}finally{assert.equal(ok(await bucket.remove([path])).length,1)}
assert.equal(ok(await b.from('invoices').select('id').eq('original_file_path',path)).length,0)
assert.ok((await bucket.download(path,{cacheNonce:randomUUID()},{cache:'no-store'})).error)
ok(await a.auth.signOut());ok(await b.auth.signOut())
console.log('Passed: two password logins, session refresh, idempotent onboarding, tenant visibility, synthetic purchasing queries, private file upload/download/delete, cross-tenant file denial and logout.')
