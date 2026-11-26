import {Area,AreaChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis} from 'recharts'

import {periodSpend,today} from '../../supabase/functions/_shared/metrics'
import {money,analytics,useWorkspace,shortMonth,previousMonth} from '../services/analytics'
import {useState} from 'react'
export function Trend({month,ingredient,cutoff}:{month:string;ingredient?:string;cutoff?:string|null}){
 const [range,setRange]=useState('6')
 const {rows}=useWorkspace(),{prices}=analytics(cutoff?rows.filter(r=>r.date<=cutoff):rows)
 const asOf=today()
 const history=[month];while(history.length<Number(range))history.unshift(previousMonth(history[0]))
 const data=history.map(m=>{
  const period=periodSpend(rows,m,asOf)
  const label=!ingredient&&period.scope==='Month to date'?' MTD':!ingredient&&period.scope==='Future-dated records'?' (future)':''
  return {month:shortMonth(m)+label,value:ingredient?prices(m).find(p=>p.key===ingredient)?.price:period.count?period.spend:null}
 })
 return <section className="panel chartPanel"><div className="panelHead"><div><h2>{ingredient?'Unit price trend':'Spending trend'}</h2><p>{ingredient?'Normalized CAD per base unit':'Monthly supplier spend · CAD'}</p></div><select aria-label="Chart history" value={range} onChange={e=>setRange(e.target.value)}><option value="6">6 months</option><option value="3">3 months</option></select></div>
 <div className="legend"><i/>{ingredient?'Unit price':'Total spend'}</div><div className="chart"><ResponsiveContainer width="100%" height="100%" minWidth={0}><AreaChart data={data} margin={{top:12,right:12,left:-10,bottom:0}}><defs><linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--green)" stopOpacity={0.35}/><stop offset="100%" stopColor="var(--green)" stopOpacity={0.035}/></linearGradient></defs><CartesianGrid vertical={false} strokeDasharray="3 5" stroke="var(--border)"/><XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={10} tick={{fontSize:12,fill:'var(--muted)'}}/><YAxis domain={['auto','auto']} tickFormatter={n=>ingredient?money(n,1):'$'+(n/1000)+'k'} tickLine={false} axisLine={false} tick={{fontSize:12,fill:'var(--muted)'}}/><Tooltip formatter={v=>[money(Number(v)),ingredient?'Unit price':'Total spend']}/><Area type="monotone" dataKey="value" stroke="var(--green)" strokeWidth={3} fill="url(#trendFill)" dot={{r:4,fill:'white',strokeWidth:2}} isAnimationActive={false}/></AreaChart></ResponsiveContainer></div></section>
}
