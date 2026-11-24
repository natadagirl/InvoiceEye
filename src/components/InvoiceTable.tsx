import {useEffect,useRef,useState} from 'react'
import {Link} from 'react-router-dom'
import {Icon} from './Icon'
import type {Invoice} from '../types'
import {money,displayDate} from '../services/analytics'
import {FileActions} from './FileActions'
export function InvoiceTable({rows,recent=false}:{rows:Invoice[];recent?:boolean}){
 const [selected,select]=useState<Invoice|null>(null)
 const dialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{if(selected)dialog.current?.showModal()},[selected])
 return <section className="panel tablePanel"><div className="panelHead"><div><h2>{recent?'Recent invoices':'Invoice register'}</h2><p>{recent?'Latest supplier invoices':rows.length+' matching invoices'}</p></div>{recent&&<Link className="outline" to="/invoices">View all invoices</Link>}</div><div className="tableScroll"><table><thead><tr>{['Invoice','Supplier','Date','Amount','Status'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{rows.map(i=><tr key={i.uuid}><td><button className="invoiceId" onClick={()=>select(i)}><span className="fileIcon"><Icon name="doc" size={16}/></span>{i.id}</button></td><td>{i.supplier}</td><td>{displayDate(i.date)}</td><td className="amount">{i.amount===null?'Awaiting review':money(i.amount,2,i.currency)}</td><td><span className={'status '+i.status}>{i.status}</span></td></tr>)}</tbody></table>{!rows.length&&<p className="empty">No invoices match your search.</p>}</div>
 <dialog ref={dialog} onClose={()=>select(null)}>{selected&&<><div className="panelHead"><div><div className="eyebrow">INVOICE</div><h2>{selected.id}</h2><p>{selected.supplier} · {displayDate(selected.date)}</p></div><button aria-label="Close invoice" onClick={()=>dialog.current?.close()}><Icon name="close"/></button></div><div className="tableScroll"><table><thead><tr><th>Ingredient</th><th>Quantity</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>{selected.lines.map((l,index)=><tr key={index}><td>{l.ingredient}</td><td>{l.quantity} {l.unit}</td><td>{money(l.unitPrice,2,selected.currency)}</td><td>{money(l.lineTotal,2,selected.currency)}</td></tr>)}</tbody></table></div><div className="dialogTotal">Invoice total <strong>{selected.amount===null?'Awaiting review':money(selected.amount,2,selected.currency)}</strong></div>{selected.file&&<FileActions path={selected.file}/>}</>}</dialog></section>
}
