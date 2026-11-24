import type { Invoice } from '../types'

export const months = ['2026-06','2026-07','2026-08','2026-09','2026-10','2026-11']
export const suppliers = ['Greenfield Produce','Meadowbrook Dairy','Northstar Meats','Heritage Pantry','Summit Coffee']
type Item = [string,string,number,number[]]
// Each row records a usual order quantity and six synthetic monthly unit prices in CAD.
const catalogue: Item[][] = [
  [['Roma tomatoes','kg',32,[3.10,3.25,3.17,3.45,3.75,4.42]],['Baby spinach','kg',10,[7.55,7.62,7.50,7.65,7.7,7.8]]],
  [['Unsalted butter','kg',20,[7.8,7.95,8.1,8.05,8.4,9.65]],['Whole milk','L',72,[1.64,1.67,1.64,1.72,1.74,1.76]]],
  [['Chicken breast','kg',45,[9.25,9.6,9.52,9.8,10.25,11.4]],['Ground beef','kg',24,[8.4,8.55,8.45,8.50,8.8,8.9]]],
  [['Bread flour','kg',65,[1.1,1.12,1.08,1.14,1.18,1.16]],['Olive oil','L',16,[9.0,9.15,9.05,9.45,9.75,10.05]]],
  [['Espresso beans','kg',18,[19,19.2,19.1,19.5,20.0,20.4]],['Decaf beans','kg',6,[21,21.2,21,21.3,21.2,21.5]]]
]
const volume = [1,1.12,1.04,1.22,1.16,1.32]
export const invoices:Invoice[] = months.flatMap((month,m)=>Array.from({length:15},(_,i)=>{
  const s=i%5
  return {id:'INV-'+(1001+m*15+i),date:month+'-'+String(i+2).padStart(2,'0'),supplier:suppliers[s],
    status:m===5 && i>=12?'Pending' as const:'Paid' as const,
    lines:catalogue[s].map(([ingredient,unit,qty,prices])=>({ingredient,unit,quantity:Math.round(qty*volume[m]*(0.88+Math.floor(i/5)*0.13)),unitPrice:prices[m]}))}
})).reverse()
