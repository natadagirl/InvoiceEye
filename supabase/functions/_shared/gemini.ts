export class Failure extends Error{constructor(public status:number,message:string){super(message)}}
const provider='https://generativelanguage.googleapis.com/v1beta/models/'
export async function google(path:string,key:string,body?:object){
 const res=await fetch(provider+path,{method:body?'POST':'GET',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(body?55000:8000)})
 if(!res.ok){
  const message=res.status===429?'Gemini quota reached. Retry after your quota renews.':res.status===403||res.status===401?'Gemini credentials or model access require attention.':'Gemini request failed ('+res.status+').'
  throw new Failure(res.status===429?429:502,message)
 }
 return res.json()
}
export async function selectModel(key:string){
 const configured=Deno.env.get('GEMINI_MODEL')
 const candidates=configured?[configured]:['gemini-3.1-flash-lite','gemini-2.5-flash-lite']
 for(const name of candidates){
  if(!/^gemini-[a-z0-9.-]+$/.test(name))throw new Failure(503,'Invalid Gemini model configuration.')
  const res=await fetch(provider+name,{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(8000)})
  if(res.status===404)continue
  if(!res.ok)throw new Failure(res.status===429?429:502,'Gemini model lookup failed ('+res.status+').')
  if((await res.json()).supportedGenerationMethods?.includes('generateContent'))return name
 }
 throw new Failure(503,'No configured Flash model is available to this project.')
}
