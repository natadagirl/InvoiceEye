import {useState} from 'react'
import {useSearchParams} from 'react-router-dom'
import {useAnalytics,useWorkspace,money} from '../services/analytics'
import {Upload} from '../components/FileActions'
import {InvoiceTable} from '../components/InvoiceTable'
import {Icon} from '../components/Icon'
import {Trend} from '../components/Trend'
export function Invoices({month}:{month:string}){
 const [query,setQuery]=useState('')
 const {inMonth}=useAnalytics()
 const rows=inMonth(month).filter(i=>[i.id,i.supplier,i.status].join(' ').toLowerCase().includes(query.toLowerCase().trim()))
 return <><Upload/><label className="search"><Icon name="search" size={18}/><input aria-label="Search invoices" placeholder="Search invoice, supplier or status" value={query} onChange={e=>setQuery(e.target.value)}/></label><InvoiceTable rows={rows}/></>
}
export function Tracker({month}:{month:string}){
 const {comparisons}=useAnalytics()
 const [params,setParams]=useSearchParams()
 const alertsOnly=params.get('alerts')==='1'
 const {restaurant}=useWorkspace()
 const items=comparisons(month)
 const visible=alertsOnly?items.filter(i=>i.delta!==null&&i.delta>=restaurant.alert_threshold):items
 const [selected,setItem]=useState('')
 const item=items.find(i=>i.key===selected)?.key??items[0]?.key
 if(!item)return <p className="empty">No standardized CAD prices for this month.</p>
 return <><div className="toolbar"><label>Ingredient <select value={item} onChange={e=>setItem(e.target.value)}>{items.map(i=><option key={i.key} value={i.key}>{i.ingredient} · {i.spec} · {i.supplier}</option>)}</select></label></div><Trend month={month} ingredient={item}/><section className="panel tablePanel"><div className="panelHead"><div><h2>{alertsOnly?'Price increase alerts':'Ingredient prices'}</h2><p>Quantity-weighted unit prices by supplier</p></div><button className="outline" onClick={()=>setParams(alertsOnly?{}:{alerts:'1'})}>{alertsOnly?'All prices':'Price alerts'}</button></div><div className="tableScroll"><table><thead><tr>{['Ingredient','Supplier','Previous','Current','Change'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{visible.map(i=><tr key={i.key}><td>{i.ingredient} · {i.spec}</td><td>{i.supplier}</td><td>{i.previous===undefined?'—':money(i.previous)}</td><td>{money(i.price)} / {i.unit}</td><td>{i.delta===null?'—':(i.delta>=0?'+':'')+i.delta.toFixed(1)+'%'}</td></tr>)}</tbody></table>{!visible.length&&<p className="empty">No increases meet the current threshold.</p>}</div></section></>
}
export function Insights(){
 return <section className="panel"><div className="panelHead"><div><h2>AI Insights</h2><p>Business analysis reports are planned for a later phase.</p></div><Icon name="insights"/></div></section>
}
export function Settings({threshold,onChange}:{threshold:number;onChange:(n:number)=>void}){
 return <section className="panel"><div className="panelHead"><div><h2>Workspace preferences</h2><p>{useWorkspace().restaurant.name} · CAD</p></div></div><div className="setting"><div><h3>Price alert threshold</h3><p>Flag ingredients whose monthly unit price increases by at least this percentage.</p></div><select aria-label="Price alert threshold" value={threshold} onChange={e=>onChange(Number(e.target.value))}>{[5,10,15,20].map(t=><option key={t} value={t}>{t}%</option>)}</select></div></section>
}
