import {periodSpend,today} from '../../supabase/functions/_shared/metrics'
import {Link} from 'react-router-dom'

import {money,useAnalytics,useWorkspace} from '../services/analytics'
import {Icon,type IconName} from '../components/Icon'
import {Trend} from '../components/Trend'
import {InvoiceTable} from '../components/InvoiceTable'
export function Dashboard({month,threshold}:{month:string;threshold:number}){
 const {inMonth,comparisons}=useAnalytics()
 const invoices=inMonth(month),period=periodSpend(useWorkspace().rows,month,today()),spend=period.spend
 const alerts=(useWorkspace().restaurant.alerts_enabled?comparisons(month):[]).filter(i=>i.delta!==null && i.delta>=threshold)
 const count=new Set(invoices.map(i=>i.supplierId).filter(Boolean)).size
 const delta=period.delta
 const cards:{label:string;value:string;icon:IconName;tone:string;detail:React.ReactNode}[]=[
 {label:'Confirmed purchases (CAD)',value:money(spend),icon:'wallet',tone:'peach',detail:delta===null?period.scope+' · No comparable change':<><b className="coral">{delta>=0?'↗':'↘'} {Math.abs(delta).toFixed(1)}%</b> {period.scope==='Month to date'?'vs. same dates last month':'vs. prior calendar month'}</>},
 {label:'Invoices received',value:String(invoices.length),icon:'invoices',tone:'blue',detail:'In selected month'},
 {label:'Active suppliers',value:String(count),icon:'box',tone:'mint',detail:'Across all invoices'},
 {label:'Price alerts',value:String(alerts.length),icon:'alert',tone:'gold',detail:'Above alert threshold'}]
 return <><p className="coverageLine">{period.scope} · {period.count} confirmed CAD invoices{period.future>0&&' · Future-dated purchases: '+money(period.futureSpend)}{!period.count&&' · Insufficient data'}</p><div className="cards">{cards.map(c=><div className="card" key={c.label}><div className="metricLabel"><span className={'tile '+c.tone}><Icon name={c.icon} size={18}/></span>{c.label}</div><strong className="metric">{c.value}</strong><div className="detail">{c.detail}</div></div>)}</div><div className="dashboardGrid"><Trend month={month}/><section className="panel alerts"><div className="panelHead"><div><h2>Price increase alerts</h2><p>Largest unit price increases</p></div><span className="alertCount">{alerts.length}</span></div><div className="alertList">{alerts.slice(0,3).map(p=><div className="alertRow" key={p.key}><span className="ingredientIcon"><Icon name={p.ingredient==='Roma tomatoes'?'tomato':p.ingredient==='Unsalted butter'?'butter':p.ingredient==='Chicken breast'?'chicken':'box'}/></span><div><strong>{p.ingredient}</strong><small>{p.supplier}</small></div><b className="rise">+{p.delta!.toFixed(1)}%</b></div>)}{!alerts.length&&<p className="empty">{'No comparable increases meet your threshold.'}</p>}</div><Link className="trackerLink" to="/price-tracker?alerts=1">View all price alerts <Icon name="right" size={14}/></Link></section></div><InvoiceTable rows={invoices.slice(0,5)} recent/></>
}
