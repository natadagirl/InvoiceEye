import {createContext,useContext} from 'react'
import type {Invoice,Restaurant} from '../types'
export const WorkspaceContext=createContext<{rows:Invoice[];restaurant:Restaurant;setRestaurant:(r:Restaurant)=>void;refresh:()=>void}|null>(null)
export function useWorkspace(){const value=useContext(WorkspaceContext);if(!value)throw new Error('Workspace unavailable');return value}
export const money=(n:number,digits=2,currency='CAD')=>new Intl.NumberFormat('en-CA',{style:'currency',currency,minimumFractionDigits:digits,maximumFractionDigits:digits}).format(n)
export const change=(a:number,b:number)=>(a/b-1)*100
export const shortMonth=(m:string)=>new Date(m+'-01T12:00:00').toLocaleDateString('en-CA',{month:'short'})
export const displayDate=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'})
export function previousMonth(m:string){const d=new Date(m+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7)}
export function analytics(rows:Invoice[]){
 const months=[...new Set(rows.map(i=>i.date.slice(0,7)))].sort()
 if(!months.length)months.push(new Date().toISOString().slice(0,7))
 const inMonth=(m:string)=>rows.filter(i=>i.date.startsWith(m))
 const ready=(m:string)=>inMonth(m).filter(i=>i.status==='ready' && i.currency==='CAD')
 const monthlySpend=(m:string)=>ready(m).reduce((sum,i)=>sum+(i.amount??0),0)
 function prices(m:string){
  const groups=new Map<string,{key:string;ingredient:string;spec:string;unit:string;supplier:string;qty:number;cost:number}>()
  for(const invoice of ready(m))for(const line of invoice.lines){
   if(!line.productKey)continue
   const key=invoice.supplierId+'/'+line.productKey
   const group=groups.get(key)??{key,ingredient:line.ingredient,spec:line.specification,unit:line.baseUnit,supplier:invoice.supplier,qty:0,cost:0}
   const normalizedQty=line.quantity*line.packageSize
   group.qty+=normalizedQty
   group.cost+=normalizedQty*line.normalizedPrice
   groups.set(key,group)
  }
  return [...groups.values()].map(g=>({...g,price:g.cost/g.qty}))
 }
 function comparisons(m:string){
  const previous=new Map(prices(previousMonth(m)).map(i=>[i.key,i.price]))
  return prices(m).map(i=>{const prior=previous.get(i.key);return {...i,previous:prior,delta:prior?change(i.price,prior):null}}).sort((a,b)=>(b.delta??-Infinity)-(a.delta??-Infinity))
 }
 return {months,inMonth,monthlySpend,comparisons,prices}
}
export function useAnalytics(){return analytics(useWorkspace().rows)}
