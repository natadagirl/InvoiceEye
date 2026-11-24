export type Purchase={uuid:string;date:string;currency:string;status:string;amount:number|null;supplierId:string|null;supplier:string;lines:{productKey:string|null;ingredient:string;specification:string;baseUnit:string;quantity:number;packageSize:number;normalizedPrice:number}[]}
export type Fact={id:string;kind:'spend'|'driver'|'risk'|'comparison'|'volume';label:string;evidence:string;month:string;supplier?:string;key?:string;impact?:number}
export function offset(month:string,n:number){const d=new Date(month+'-01T12:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7)}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Edmonton',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
const cash=(v:number)=>'CAD '+v.toLocaleString('en-CA',{minimumFractionDigits:2,maximumFractionDigits:2})
const round=(n:number)=>Math.round(n*100)/100
export function periodSpend(rows:Purchase[],month:string,asOf:string){
 const prior=offset(month,-1),current=asOf.slice(0,7),partial=month===current,cad=rows.filter(r=>r.status==='ready'&&r.currency==='CAD')
 const selected=cad.filter(r=>r.date.startsWith(month))
 const included=selected.filter(r=>!partial||r.date<=asOf)
 const baseline=cad.filter(r=>r.date.startsWith(prior)&&(!partial||r.date.slice(8)<=asOf.slice(8)))
 const sum=(list:Purchase[])=>round(list.reduce((s,i)=>s+(i.amount??0),0))
 const spend=sum(included),before=sum(baseline)
 const future=selected.filter(r=>r.date>asOf)
 const delta=month<=current&&included.length&&baseline.length&&before>0?round((spend/before-1)*100):null
 return {month,spend,before,delta,count:included.length,future:future.length,futureSpend:sum(future),scope:month>current?'Future-dated records':partial?'Month to date':'Closed calendar month'}
}
export function calculate(rows:Purchase[],end:string,months:number,asOf:string){
 const start=offset(end,1-months),prior=offset(end,-1)
 const relevant=rows.filter(r=>r.status==='ready'&&r.date.slice(0,7)>=offset(start,-1)&&r.date.slice(0,7)<=end)
 const selected=relevant.filter(r=>r.date.slice(0,7)>=start)
 const cad=selected.filter(r=>r.currency==='CAD')
 const spend=round(cad.reduce((s,r)=>s+(r.amount??0),0))
 const monthly=Array.from({length:months},(_,i)=>periodSpend(relevant,offset(start,i),asOf))
 const facts:Fact[]=[]
 function add(f:Omit<Fact,'id'>){facts.push({...f,id:'m'+(facts.length+1)})}
 add({kind:'spend',label:'Recorded purchasing expenditure',month:end,evidence:cash(spend)+' across '+cad.length+' confirmed CAD invoices, '+start+' through '+end+'.'})
 const suppliers=new Map<string,{supplier:string;spend:number}>()
 for(const row of cad){const k=row.supplierId!,s=suppliers.get(k)??{supplier:row.supplier,spend:0};s.spend+=row.amount??0;suppliers.set(k,s)}
 const drivers=[...suppliers.values()].sort((a,b)=>b.spend-a.spend||a.supplier.localeCompare(b.supplier)).map(s=>({...s,spend:round(s.spend),share:spend?round(s.spend/spend*100):0}))
 for(const s of drivers.slice(0,5))add({kind:'driver',month:end,label:s.supplier,supplier:s.supplier,evidence:s.supplier+' accounts for '+cash(s.spend)+' ('+s.share.toFixed(1)+'% of recorded CAD expenditure).'})
 function prices(m:string){
  const groups=new Map<string,{key:string;product:string;ingredient:string;spec:string;supplier:string;unit:string;quantity:number;cost:number}>()
  for(const r of relevant.filter(r=>r.currency==='CAD'&&r.date.startsWith(m)))for(const l of r.lines){
   if(!l.productKey||!r.supplierId)continue
   const key=r.supplierId+'/'+l.productKey
   const g=groups.get(key)??{key,product:l.productKey,ingredient:l.ingredient,spec:l.specification,supplier:r.supplier,unit:l.baseUnit,quantity:0,cost:0}
   const q=l.quantity*l.packageSize;g.quantity+=q;g.cost+=q*l.normalizedPrice;groups.set(key,g)
  }
  return [...groups.values()].map(g=>({...g,price:g.cost/g.quantity}))
 }
 const latest=prices(end),previous=new Map(prices(prior).map(p=>[p.key,p]))
 const changes=latest.flatMap(g=>{const p=previous.get(g.key);return !p||p.price<=0?[]:[{...g,previous:p.price,previousQty:p.quantity,change:round((g.price/p.price-1)*100),priceEffect:round((g.price-p.price)*g.quantity),volumeEffect:round((g.quantity-p.quantity)*p.price)}]}).sort((a,b)=>b.priceEffect-a.priceEffect)
 for(const g of changes.filter(g=>g.priceEffect>0).slice(0,6))add({kind:'risk',month:end,key:g.key,supplier:g.supplier,label:g.ingredient+' · '+g.supplier,impact:g.priceEffect,evidence:g.ingredient+' rose '+g.change.toFixed(1)+'% from '+cash(g.previous)+' to '+cash(g.price)+'/'+g.unit+' at '+g.supplier+'. At the recorded '+g.quantity+' '+g.unit+', the unit-price effect was '+cash(g.priceEffect)+'.'})
 for(const g of [...changes].sort((a,b)=>Math.abs(b.volumeEffect)-Math.abs(a.volumeEffect)).slice(0,3))add({kind:'volume',month:end,key:g.key,supplier:g.supplier,label:g.ingredient+' · '+g.supplier,evidence:'Recorded quantity changed from '+g.previousQty+' to '+g.quantity+' '+g.unit+'. At the prior unit price, the volume effect was '+cash(g.volumeEffect)+'.'})
 // Compare offers only within the same invoice month. Retain the most recent observed
 // comparison per buyer/product pair to avoid summing overlapping estimates.
 const history=monthly.map(m=>({month:m.month,prices:prices(m.month)}))
 const opportunities=history.flatMap(period=>period.prices.flatMap(g=>{
  const cheaper=period.prices.filter(x=>x.product===g.product&&x.unit===g.unit&&x.spec===g.spec&&x.price<g.price-0.000001).sort((a,b)=>a.price-b.price)[0]
  return cheaper?[{...g,month:period.month,alternative:cheaper.supplier,alternativePrice:cheaper.price,estimate:round((g.price-cheaper.price)*g.quantity)}]:[]
 }))
 const alternatives=[...new Map(opportunities.map(g=>[g.key,g])).values()].sort((a,b)=>b.estimate-a.estimate)
 for(const g of alternatives.slice(0,5))add({kind:'comparison',month:g.month,key:g.key,supplier:g.supplier,label:g.ingredient+' · '+g.supplier,impact:g.estimate,evidence:'In '+g.month+', '+g.supplier+' recorded '+cash(g.price)+'/'+g.unit+' versus '+cash(g.alternativePrice)+'/'+g.unit+' at '+g.alternative+' for '+g.spec+'. Applying the difference to '+g.quantity+' '+g.unit+' gives an illustrative '+cash(g.estimate)+'.'})
 const dates=cad.map(r=>r.date).sort()
 const coverage={count:cad.length,total:spend,first:dates[0]??null,last:dates.at(-1)??null,future:cad.filter(r=>r.date>asOf).length,excluded:selected.length-cad.length,unmatched:cad.reduce((s,r)=>s+r.lines.filter(l=>!l.productKey).length,0),sourceIds:relevant.map(r=>r.uuid).sort()}
 const limitations=['Confirmed purchasing records cover supplier expenditure only. Revenue, recipes and operating profit are outside this dataset.','Supplier comparisons use recorded prices. Obtain current quotes, pack terms and availability before purchasing.','Recorded invoices may cover only part of a calendar month. Price and volume effects refer to matched line items before header taxes or discounts.']
 if(coverage.future)limitations.push('Includes future-dated confirmed invoices. These amounts are reported separately from month-to-date spending.')
 if(coverage.unmatched)limitations.push('Unmatched lines contribute to expenditure and are excluded from price comparisons.')
 if(coverage.excluded)limitations.push('Other currencies are excluded from CAD metrics.')
 if(!changes.length)limitations.push('Insufficient comparable lines across the last two months for price-change estimates.')
 return {start,end,months,asOf,coverage,monthly,drivers,prices:latest,changes,alternatives,history,facts,limitations}
}
export type Snapshot=ReturnType<typeof calculate>
