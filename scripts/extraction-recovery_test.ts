// Isolated transport test. No real account, credentials, network or model calls.
import {extractInvoice} from '../supabase/functions/extract-invoice/handler.ts'
import {emptyDraft} from '../supabase/functions/extract-invoice/format.ts'
Deno.test('provider quota failure is recorded; retry completes the leased invoice',async()=>{
 const realFetch=globalThis.fetch
 const invoice='01234567-89ab-4cde-8989-0123456789ef'
 const states:string[]=[]
 const variables={SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-worker',geminiapi:'test-provider',GEMINI_MODEL:'gemini-3.1-flash-lite'}
 const previous=new Map<string,string|undefined>()
 for(const [k,v] of Object.entries(variables)){previous.set(k,Deno.env.get(k));Deno.env.set(k,v)}
 let fail=true
 globalThis.fetch=async(request,init)=>{
  const url=new URL(request instanceof Request?request.url:request.toString())
  if(url.hostname==='generativelanguage.googleapis.com'){
   if(!url.pathname.endsWith('generateContent'))return Response.json({supportedGenerationMethods:['generateContent']})
   if(fail)return Response.json({}, {status:429})
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(emptyDraft())}]}}]})
  }
  if(url.pathname.startsWith('/auth/'))return Response.json({id:invoice})
  if(url.pathname.endsWith('/invoices'))return Response.json({restaurant_id:invoice,original_file_path:invoice+'/'+invoice+'.pdf',processing_status:'uploaded'})
  if(url.pathname.endsWith('/restaurant_members'))return Response.json({restaurant_id:invoice})
  if(url.pathname.startsWith('/storage/'))return new Response('%PDF-1.4 synthetic')
  if(url.pathname.endsWith('/claim_invoice_extraction'))return Response.json(invoice)
  if(url.pathname.endsWith('/finish_invoice_extraction')){
   const body=JSON.parse(String(init?.body))
   states.push(body.failure?'failed':'awaiting_review')
   return Response.json(true)
  }
  throw new Error('Unexpected transport operation')
 }
 try{
  const request=()=>new Request('https://fixture.invalid/extract-invoice',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({invoiceId:invoice})})
  const first=await extractInvoice(request())
  if(first.status!==429)throw new Error('Expected quota response, got '+first.status+' '+await first.text())
  fail=false
  const second=await extractInvoice(request())
  if(second.status!==200||states.join(',')!=='failed,awaiting_review')throw new Error('Retry failed: '+second.status+' '+await second.text())
 }finally{globalThis.fetch=realFetch;for(const [k,v] of previous){if(v===undefined)Deno.env.delete(k);else Deno.env.set(k,v)}}
})
