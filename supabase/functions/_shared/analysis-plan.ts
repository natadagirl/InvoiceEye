import type {Fact} from './metrics.ts'
export const actions={
 negotiate:'Request a price review and pack-size breakdown from the supplier.',
 quote:'Request current quotes for the same ingredient specification and delivery terms.',
 volume:'Check order quantities against delivery frequency and kitchen usage.',
 monitor:'Monitor the next delivery for a change in normalized unit price.',
 concentration:'Review purchasing concentration and continuity options with the supplier.'
}
export const allowed={risk:['negotiate','monitor'],comparison:['quote'],volume:['volume'],driver:['concentration'],spend:[]} as const
export type Choice={metric:string;action:keyof typeof actions;priority:'High'|'Medium'|'Low'}
export type Plan={executiveSummary:string[];keyFindings:string[];riskAssessment:string[];supplierNegotiationOpportunities:string[];estimatedSavingsOpportunities:string[];recommendations:Choice[];limitations:string[]}
export function validatePlan(raw:unknown,facts:Fact[],limits:string[]):raw is Plan{
 if(!raw||typeof raw!=='object')return false
 const p=raw as Plan,byId=new Map(facts.map(f=>[f.id,f]))
 const sections={executiveSummary:['spend','driver','risk','comparison','volume'],keyFindings:['spend','driver','risk','comparison','volume'],riskAssessment:['risk'],supplierNegotiationOpportunities:['risk','comparison','driver'],estimatedSavingsOpportunities:['comparison']}
 for(const [key,kinds] of Object.entries(sections)){
  const ids=p[key as keyof typeof sections]
  if(!Array.isArray(ids)||ids.length>6||!ids.every(id=>kinds.includes(byId.get(id)?.kind??'')))return false
 }
 return p.executiveSummary.length>0&&p.keyFindings.length>0&&Array.isArray(p.limitations)&&p.limitations.every(k=>limits.includes(k))&&Array.isArray(p.recommendations)&&p.recommendations.length>0&&p.recommendations.length<=6&&p.recommendations.every(r=>{
  const f=r&&byId.get(r.metric);return !!f&&Object.keys(r).every(k=>['metric','action','priority'].includes(k))&&(allowed[f.kind] as readonly string[]).includes(r.action)&&['High','Medium','Low'].includes(r.priority)
 })&&Object.keys(p).every(k=>k in sections||k==='limitations'||k==='recommendations')
}
