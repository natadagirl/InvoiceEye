import {invoices,months} from '../data/invoices'
import type {Invoice} from '../types'
export const money=(n:number,digits=2)=>new Intl.NumberFormat('en-CA',{style:'currency',currency:'CAD',minimumFractionDigits:digits,maximumFractionDigits:digits}).format(n)
export const total=(inv:Invoice)=>inv.lines.reduce((sum,l)=>sum+l.quantity*l.unitPrice,0)
export const inMonth=(m:string)=>invoices.filter(i=>i.date.startsWith(m))
export const monthlySpend=(m:string)=>inMonth(m).reduce((sum,i)=>sum+total(i),0)
export const change=(a:number,b:number)=>(a/b-1)*100
export const shortMonth=(m:string)=>new Date(m+'-01T12:00:00').toLocaleDateString('en-CA',{month:'short'})
export const displayDate=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'})
export function prices(month:string){
 const current=new Map<string,{ingredient:string;unit:string;supplier:string;qty:number;cost:number}>()
 for(const invoice of inMonth(month)) for(const line of invoice.lines){
  const entry=current.get(line.ingredient)??{ingredient:line.ingredient,unit:line.unit,supplier:invoice.supplier,qty:0,cost:0}
  entry.qty+=line.quantity
  entry.cost+=line.quantity*line.unitPrice
  current.set(line.ingredient,entry)
 }
 return Array.from(current.values(),v=>({...v,price:v.cost/v.qty}))
}
export function comparisons(month:string){
 const priorMonth=months[months.indexOf(month)-1]
 const previous=priorMonth?prices(priorMonth):[]
 return prices(month).map(p=>{
  const prior=previous.find(x=>x.ingredient===p.ingredient)
  return {...p,previous:prior?.price,delta:prior?change(p.price,prior.price):null}
 }).sort((a,b)=>(b.delta??0)-(a.delta??0))
}
