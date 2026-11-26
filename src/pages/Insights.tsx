import {useEffect,useState} from 'react'
import {Link,useSearchParams} from 'react-router-dom'
import {db} from '../services/supabase'
import {useWorkspace,money} from '../services/analytics'
import {calculate,offset,today,type Snapshot,type Fact} from '../../supabase/functions/_shared/metrics'
import {validatePlan,actions,type Plan} from '../../supabase/functions/_shared/analysis-plan'
type Report={version:number;snapshot:Snapshot;ai:Plan;model:string;generatedAt:string}
type RecordRow={id:string;report:Report}
function valid(r:Report){return r?.version===1&&Array.isArray(r.snapshot?.facts)&&Array.isArray(r.snapshot?.limitations)&&validatePlan(r.ai,r.snapshot.facts,r.snapshot.limitations.map((_,i)=>'l'+i))}
function ReportView({report}:{report:Report}){
 const {snapshot:s,ai}=report
 const lookup=new Map(s.facts.map(f=>[f.id,f]))
 const facts=(ids:string[])=>ids.map(id=>lookup.get(id)!)
 const renderEvidence=(label:string,list:Fact[],empty:string)=><section className="panel analysisSection"><h2>{label}</h2>{list.length?list.map(f=><p key={f.id}>{f.evidence}</p>):<p>{empty}</p>}</section>
 return <><section className="panel analysisSection summaryPanel"><div className="eyebrow">EXECUTIVE SUMMARY</div><h2>{s.start} through {s.end}</h2>{facts(ai.executiveSummary).map(f=><p key={f.id}>{f.evidence}</p>)}<small>Generated {new Date(report.generatedAt).toLocaleString()} · {report.model}</small></section>
 <div className="cards">{[['Confirmed CAD purchases',money(s.coverage.total)],['CAD invoices',s.coverage.count],['Suppliers',s.drivers.length],['Future-dated CAD invoices',s.coverage.future]].map(([k,v])=><div className="card" key={k}><div className="metricLabel">{k}</div><strong className="metric">{v}</strong></div>)}</div>
 <section className="panel analysisSection"><h2>Monthly purchasing expenditure</h2><p>Recorded CAD purchases from {s.coverage.first} to {s.coverage.last}.</p><div className="tableScroll"><table><thead><tr><th>Month</th><th>Coverage</th><th>Amount</th><th>Change</th></tr></thead><tbody>{s.monthly.map(m=><tr key={m.month}><td>{m.month}</td><td>{m.scope} · {m.count} invoices</td><td>{money(m.spend)}</td><td>{m.delta===null?'Insufficient comparable period':m.delta.toFixed(1)+'%'}</td></tr>)}</tbody></table></div></section>
 <div className="analysisGrid">
 {renderEvidence('Key findings',facts(ai.keyFindings),'No findings selected.')}
 {renderEvidence('Major spending drivers',s.facts.filter(f=>f.kind==='driver'),'No supplier totals.')}
 {renderEvidence('Ingredient price risks',facts(ai.riskAssessment),'No risk selected for this period.')}
 {renderEvidence('Largest unit-price effects',s.facts.filter(f=>f.kind==='risk'),'No comparable increase in the ending month.')}
 {renderEvidence('Supplier comparisons',s.facts.filter(f=>f.kind==='comparison'),'No lower-priced comparable supplier in the period.')}
 {renderEvidence('Negotiation opportunities',facts(ai.supplierNegotiationOpportunities),'No evidence-backed negotiation opportunity selected.')}
 {renderEvidence('Potential savings',facts(ai.estimatedSavingsOpportunities),'No supported historical savings estimate selected.')}
 </div>
 <h2>Prioritized recommendations</h2><div className="analysisGrid">{[...ai.recommendations].sort((a,b)=>['High','Medium','Low'].indexOf(a.priority)-['High','Medium','Low'].indexOf(b.priority)).map((r,i)=>{
 const f=lookup.get(r.metric)!,target=f.key?'/price-tracker?month='+f.month+'&item='+encodeURIComponent(f.key):'/invoices?from='+s.start+'&through='+s.end+'&supplier='+encodeURIComponent(f.supplier??'')
 return <article className="panel analysisSection" key={i}><div className="eyebrow">{r.priority} priority · AI recommendation</div><h3>{f.label}</h3><p><strong>Suggested action</strong> · {actions[r.action]}</p><p>{f.evidence}</p><Link className="trackerLink" to={target}>{f.key?'Open ingredient in Price Tracker':'View supplier invoices'}</Link></article>})}</div>
 <section className="panel analysisSection"><h2>Coverage and limitations</h2><p>{s.coverage.excluded} other-currency invoices excluded · {s.coverage.unmatched} unmatched lines.</p>{s.limitations.map(v=><p key={v}>{v}</p>)}</section></>
}
export function Insights({month}:{month:string}){
 const {restaurant,rows}=useWorkspace(),[months,setMonths]=useState(12),[list,setList]=useState<RecordRow[]>([]),[active,setActive]=useState<RecordRow|null>(null)
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[stale,setStale]=useState(false),[revision,reload]=useState(0)
 const [params,setParams]=useSearchParams(),requested=params.get('report')
 const snapshot=calculate(rows,month,months,today())
 const insufficient=!snapshot.coverage.count||(snapshot.coverage.count<2&&!snapshot.changes.length)
 useEffect(()=>{let alive=true;setLoading(true)
 ;(async()=>{const history:RecordRow[]=[];for(let i=0;;i+=100){const {data,error}=await db!.from('ai_reports').select('id,report').eq('restaurant_id',restaurant.id).order('created_at',{ascending:false}).order('id').range(i,i+99);if(error)throw error;history.push(...data.filter(r=>valid(r.report)));if(data.length<100)break}
 if(alive){setList(history);setActive(old=>(requested?history.find(r=>r.id===requested):old)??history.find(r=>r.report.snapshot.end===month&&r.report.snapshot.months===months)??null)}
 })().catch(()=>{if(alive)setError('Report history could not be loaded.')}).finally(()=>{if(alive)setLoading(false)})
 return ()=>{alive=false}},[restaurant.id,month,months,revision,requested])
 useEffect(()=>{let alive=true;setStale(false)
 if(!active)return
 const s=active.report.snapshot
 async function check(){
 const ids:string[]=[]
 for(let i=0;;i+=200){const {data,error}=await db!.from('invoices').select('id').eq('restaurant_id',restaurant.id).eq('processing_status','ready').gte('invoice_date',offset(s.start,-1)+'-01').lt('invoice_date',offset(s.end,1)+'-01').order('id').range(i,i+199);if(error){if(alive)setError('Could not verify report freshness.');return}ids.push(...data.map(r=>r.id));if(data.length<200)break}
 if(alive)setStale(ids.join()!==s.coverage.sourceIds.join())
 }
 void check();window.addEventListener('focus',check);return ()=>{alive=false;window.removeEventListener('focus',check)}
 },[active,restaurant.id,rows])
 async function generate(){
 setBusy(true);setError('')
 try{const {data,error}=await db!.functions.invoke('generate-analysis',{body:{restaurantId:restaurant.id,end:month,months}})
 if(error){const body=await error.context?.json?.().catch(()=>null);throw Error(body?.error??'Unable to reach the analysis service.')}
 if(!valid(data?.report))throw Error('Report validation failed.')
 setActive(data);setParams({report:data.id});setList(prev=>[data,...prev.filter(r=>r.id!==data.id)])
 }catch(e){setError(e instanceof Error?e.message:'Generation failed.')}finally{setBusy(false)}
 }
 return <div className="analysis"><section className="panel analysisSection"><div className="reportControls"><label>Analysis period <select disabled={busy} value={months} onChange={e=>{setMonths(Number(e.target.value));setActive(null)}}>{[1,3,6,12].map(n=><option value={n} key={n}>{n} month{n!==1?'s':''} ending {month}</option>)}</select></label><button className="primary" disabled={busy||insufficient} onClick={generate}>{busy?'Generating analysis…':'Generate analysis'}</button></div><p>{snapshot.coverage.count} confirmed CAD invoices · {snapshot.start} to {month}</p>{insufficient&&<p>Insufficient purchasing history. Select a longer period or confirm additional invoices.</p>}</section>
 {error&&<div role="alert" className="reviewError">{error} <button onClick={()=>{setError('');reload(n=>n+1)}}>Reload history</button></div>}
 <label>Analysis history <select disabled={busy||loading} value={active?.id??''} onChange={e=>{setActive(list.find(r=>r.id===e.target.value)??null);setParams(e.target.value?{report:e.target.value}:{})}}><option value="">{loading?'Loading reports…':'Choose a saved report'}</option>{list.map(r=><option key={r.id} value={r.id}>{r.report.snapshot.start} – {r.report.snapshot.end} · {new Date(r.report.generatedAt).toLocaleString()}</option>)}</select></label>
 {stale&&<p className="reviewNotes">Confirmed invoice coverage has changed since this report was generated.</p>}
 {active?<ReportView report={active.report}/>:!loading&&<section className="panel analysisSection"><h2>No report selected</h2><p>Generate an analysis for this period or reopen a saved report.</p></section>}</div>
}
