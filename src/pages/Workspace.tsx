import {Icon} from '../components/Icon'
import {useEffect,useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {analytics,useAnalytics,useWorkspace,money} from '../services/analytics'
import {Upload} from '../components/FileActions'
import {InvoiceTable} from '../components/InvoiceTable'

import {Trend} from '../components/Trend'
export function Invoices({month}:{month:string}){
 const [params,setParams]=useSearchParams()
 const [query,setQuery]=useState(params.get('supplier')??'')
 const {inMonth}=useAnalytics(),{rows:all}=useWorkspace()
 useEffect(()=>{const supplier=params.get('supplier');if(supplier)setQuery(supplier)},[params])
 const from=params.get('from'),through=params.get('through')
 const scoped=from&&through?all.filter(r=>r.status==='ready'&&r.currency==='CAD'&&r.date.slice(0,7)>=from&&r.date.slice(0,7)<=through):inMonth(month)
 const rows=scoped.filter(i=>(!params.has('since')||i.date>=params.get('since')!)&&(!params.has('until')||i.date<=params.get('until')!)&&(!params.has('invoice')||i.uuid===params.get('invoice'))&&(!params.has('supplierId')||i.supplierId===params.get('supplierId'))).filter(i=>[i.id,i.supplier,i.status].join(' ').toLowerCase().includes(query.toLowerCase().trim()))
 return <><Upload/>{from&&through&&<p className="coverageLine">Confirmed CAD invoices · {from} through {through} <button onClick={()=>setParams({})}>Clear report period</button></p>}<label className="search"><Icon name="search" size={18}/><input aria-label="Search invoices" placeholder="Search invoice, supplier or status" value={query} onChange={e=>{const v=e.target.value;setQuery(v);const match=all.find(r=>r.supplier.toLowerCase()===v.trim().toLowerCase());if(match?.supplierId){params.set('supplier',match.supplier);setParams(params,{replace:true})}else if(params.has('supplier')){params.delete('supplier');setParams(params,{replace:true})}}}/></label><InvoiceTable rows={rows}/></>
}
export function Tracker({month}:{month:string}){
 const {rows}=useWorkspace()
 const [params,setParams]=useSearchParams()
 const alertsOnly=params.get('alerts')==='1'
 const {restaurant}=useWorkspace()
 const asOf=params.get('asOf')
 const items=analytics(asOf?rows.filter(r=>r.date<=asOf):rows).comparisons(month)
 const visible=alertsOnly?items.filter(i=>restaurant.alerts_enabled&&i.delta!==null&&i.delta>=restaurant.alert_threshold):items
 const selected=params.get('item')??''
 const item=items.find(i=>i.key===selected)?.key??items[0]?.key
 if(!item)return <p className="empty">No standardized CAD prices for this month.</p>
 return <><div className="toolbar"><label>Ingredient <select value={item} onChange={e=>{params.set('item',e.target.value);setParams(params)}}>{items.map(i=><option key={i.key} value={i.key}>{i.ingredient} · {i.spec} · {i.supplier}</option>)}</select></label></div><Trend month={month} ingredient={item} cutoff={asOf}/><section className="panel tablePanel"><div className="panelHead"><div><h2>{alertsOnly?'Price increase alerts':'Ingredient prices'}</h2><p>Quantity-weighted unit prices by supplier</p></div><button className="outline" onClick={()=>setParams(alertsOnly?{}:{alerts:'1'})}>{alertsOnly?'All prices':'Price alerts'}</button></div><div className="tableScroll"><table><thead><tr>{['Ingredient','Supplier','Previous','Current','Change'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{visible.map(i=><tr key={i.key}><td>{i.ingredient} · {i.spec}</td><td>{i.supplier}</td><td>{i.previous===undefined?'—':money(i.previous)}</td><td>{money(i.price)} / {i.unit}</td><td>{i.delta===null?'—':(i.delta>=0?'+':'')+i.delta.toFixed(1)+'%'}</td></tr>)}</tbody></table>{!visible.length&&<p className="empty">No increases meet the current threshold.</p>}</div></section></>
}
