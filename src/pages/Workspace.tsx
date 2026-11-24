import {useState} from 'react'
import {comparisons,inMonth,money,shortMonth} from '../services/analytics'
import {months} from '../data/invoices'
import {InvoiceTable} from '../components/InvoiceTable'
import {Icon} from '../components/Icon'
import {Trend} from '../components/Trend'
export function Invoices({month}:{month:string}){
 const [query,setQuery]=useState('')
 const rows=inMonth(month).filter(i=>[i.id,i.supplier,i.status].join(' ').toLowerCase().includes(query.toLowerCase().trim()))
 return <><label className="search"><Icon name="search" size={18}/><input aria-label="Search invoices" placeholder="Search invoice, supplier or status" value={query} onChange={e=>setQuery(e.target.value)}/></label><InvoiceTable rows={rows}/></>
}
export function Tracker({month}:{month:string}){
 const items=comparisons(month)
 const [item,setItem]=useState('Roma tomatoes')
 return <><div className="toolbar"><label>Ingredient <select value={item} onChange={e=>setItem(e.target.value)}>{items.map(i=><option key={i.ingredient}>{i.ingredient}</option>)}</select></label></div><Trend month={month} ingredient={item}/><section className="panel tablePanel"><div className="panelHead"><div><h2>Ingredient prices</h2><p>Quantity-weighted unit prices by supplier</p></div></div><div className="tableScroll"><table><thead><tr>{['Ingredient','Supplier','Previous','Current','Change'].map(h=><th key={h}>{h}</th>)}</tr></thead><tbody>{items.map(i=><tr key={i.ingredient}><td>{i.ingredient}</td><td>{i.supplier}</td><td>{i.previous===undefined?'—':money(i.previous)}</td><td>{money(i.price)} / {i.unit}</td><td>{i.delta===null?'—':(i.delta>=0?'+':'')+i.delta.toFixed(1)+'%'}</td></tr>)}</tbody></table></div></section></>
}
export function Insights({month}:{month:string}){
 const prior=months[months.indexOf(month)-1],items=comparisons(month)
 return <section className="panel"><div className="panelHead"><div><h2>Purchasing insights</h2><p>Rule-based observations from demo invoices</p></div><Icon name="insights"/></div>{prior?items.slice(0,3).map(i=><article className="insight" key={i.ingredient}><h3>{i.ingredient}</h3><p>{i.supplier}’s unit price {i.delta!>=0?'rose':'fell'} {Math.abs(i.delta!).toFixed(1)}% from {money(i.previous!)} in {shortMonth(prior)} to {money(i.price)} per {i.unit} in {shortMonth(month)}.</p></article>):<p className="empty">Month-over-month observations begin in July.</p>}</section>
}
export function Settings({threshold,onChange}:{threshold:number;onChange:(n:number)=>void}){
 return <section className="panel"><div className="panelHead"><div><h2>Workspace preferences</h2><p>Juniper Kitchen · CAD</p></div></div><div className="setting"><div><h3>Price alert threshold</h3><p>Flag ingredients whose monthly unit price increases by at least this percentage.</p></div><select aria-label="Price alert threshold" value={threshold} onChange={e=>onChange(Number(e.target.value))}>{[5,10,15,20].map(t=><option key={t} value={t}>{t}%</option>)}</select></div></section>
}
