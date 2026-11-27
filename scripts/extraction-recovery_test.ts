// Isolated transport test. No real account, credentials, network or model calls.
import {extractInvoice} from '../supabase/functions/extract-invoice/handler.ts'
import {emptyDraft} from '../supabase/functions/extract-invoice/format.ts'
Deno.test('bounded retries, permanent errors, duplicate protection and failed lease recovery',async()=>{
 const realFetch=globalThis.fetch
 const invoice='01234567-89ab-4cde-8989-0123456789ef'
 const states:string[]=[]
 const variables={SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-worker',geminiapi:'test-provider',GEMINI_MODEL:'gemini-3.1-flash-lite'}
 const previous=new Map<string,string|undefined>()
 for(const [k,v] of Object.entries(variables)){previous.set(k,Deno.env.get(k));Deno.env.set(k,v)}
 let results:number[]=[],requests=0,claims=0,duplicate=false,busy=false,retryAfter:string|undefined
 globalThis.fetch=async(request,init)=>{
  const url=new URL(request instanceof Request?request.url:request.toString())
  if(url.hostname==='generativelanguage.googleapis.com'){
   if(!url.pathname.endsWith('generateContent'))return Response.json({supportedGenerationMethods:['generateContent']})
   requests++
   const status=results.shift()
   if(status)return Response.json({}, {status,headers:retryAfter?{'Retry-After':retryAfter}:undefined})
   return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(emptyDraft())}]}}]})
  }
  if(url.pathname.startsWith('/auth/'))return Response.json({id:invoice})
  if(url.pathname.endsWith('/invoices'))return Response.json({restaurant_id:invoice,original_file_path:invoice+'/'+invoice+'.pdf',processing_status:'uploaded'})
  if(url.pathname.endsWith('/restaurant_members'))return Response.json({restaurant_id:invoice})
  if(url.pathname.startsWith('/storage/'))return new Response('%PDF-1.4 synthetic')
  if(url.pathname.endsWith('/claim_invoice_extraction')){
   claims++
   if(busy)return Response.json({code:'P0001',message:'Extraction already running'}, {status:400})
   if(duplicate)return Response.json({code:'23505',message:'Duplicate fixture'}, {status:409})
   return Response.json(invoice)
  }
  if(url.pathname.endsWith('/finish_invoice_extraction')){
   const body=JSON.parse(String(init?.body))
   states.push(body.failure?'failed':'awaiting_review')
   return Response.json(true)
  }
  throw new Error('Unexpected transport operation')
 }
 try{
  const request=()=>new Request('https://fixture.invalid/extract-invoice',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({invoiceId:invoice})})
  async function verify(sequence:number[],status:number,count:number,expected:string){
   const before=requests,previousClaims=claims,previousSaves=states.length
   results=sequence
   const response=await extractInvoice(request())
   if(response.status!==status||requests-before!==count||claims-previousClaims!==1||states.slice(previousSaves).join()!==expected){
    throw new Error('Unexpected fixture result: '+response.status+' '+await response.text())
   }
   return response
  }
  await verify([503],200,2,'awaiting_review')
  await verify([503,503,503],502,3,'failed')
  await verify([403],502,1,'failed')
  await verify([429],429,1,'failed')
  retryAfter='0'
  await verify([429],200,2,'awaiting_review')
  retryAfter='120'
  await verify([429],429,1,'failed')
  retryAfter=undefined
  await verify([],200,1,'awaiting_review')
  duplicate=true
  const conflict=await verify([],409,0,'')
  if(!(await conflict.json()).error.includes('Duplicate file'))throw new Error('Duplicate not identified')
  duplicate=false
  busy=true
  const active=await verify([],409,0,'')
  if(!(await active.json()).error.includes('already running'))throw new Error('Active lease not identified')
 }finally{globalThis.fetch=realFetch;for(const [k,v] of previous){if(v===undefined)Deno.env.delete(k);else Deno.env.set(k,v)}}
})
