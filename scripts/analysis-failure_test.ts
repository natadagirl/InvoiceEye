// Deterministic provider failures must release the worker lease without persisting a report.
import {generateAnalysis} from '../supabase/functions/generate-analysis/handler.ts'
Deno.test('quota and unsupported AI evidence both release the analysis lease',async()=>{
 const id='01234567-89ab-4cde-8989-0123456789ef'
 const variables={SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'test-public',SUPABASE_SERVICE_ROLE_KEY:'test-worker',geminiapi:'test-provider',GEMINI_MODEL:'gemini-3.1-flash-lite'}
 const previous=new Map<string,string|undefined>(),original=globalThis.fetch
 for(const [k,v] of Object.entries(variables)){previous.set(k,Deno.env.get(k));Deno.env.set(k,v)}
 let quota=true,releases=0
 globalThis.fetch=async(req,init)=>{
  const url=new URL(req instanceof Request?req.url:req.toString())
  if(url.hostname==='generativelanguage.googleapis.com'){
   if(!url.pathname.endsWith('generateContent'))return Response.json({supportedGenerationMethods:['generateContent']})
   return quota?Response.json({},{status:429}):Response.json({candidates:[{content:{parts:[{text:'{"executiveSummary":["invented metric"]}'}]}}]})
  }
  if(url.pathname.includes('/auth/'))return Response.json({id})
  if(url.pathname.endsWith('/restaurant_members'))return Response.json({role:'owner'})
  if(url.pathname.endsWith('/analysis_inputs'))return Response.json([1,2].map(n=>({uuid:String(n),date:'2026-10-10',supplier:'Synthetic',supplierId:id,amount:10,currency:'CAD',status:'ready',lines:[]})))
  if(url.pathname.endsWith('/claim_analysis'))return Response.json(id)
  if(url.pathname.endsWith('/finish_analysis')){
   if(JSON.parse(String(init?.body)).payload!==null)throw Error('Unexpected report write')
   releases++;return Response.json(null)
  }
  throw Error('Unexpected request')
 }
 try{
  const req=()=>new Request('https://fixture.invalid',{method:'POST',headers:{Authorization:'Bearer fixture'},body:JSON.stringify({restaurantId:id,end:'2026-10',months:1})})
  if((await generateAnalysis(req())).status!==429)throw Error('Missing quota signal')
  quota=false
  if((await generateAnalysis(req())).status!==502||releases!==2)throw Error('Invalid output accepted or lease left active')
 }finally{globalThis.fetch=original;for(const [k,v] of previous){if(v===undefined)Deno.env.delete(k);else Deno.env.set(k,v)}}
})
