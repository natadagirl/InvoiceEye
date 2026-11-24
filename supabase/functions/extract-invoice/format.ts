export const headerText=['supplier','number','date','currency'] as const
export const headerNumbers=['subtotal','tax','discounts','total'] as const
export const itemText=['name','description','unit','packageUnit'] as const
export const itemNumbers=['quantity','packageSize','unitPrice','lineTotal'] as const
export type Item=Record<typeof itemText[number],string|null>&Record<typeof itemNumbers[number],number|null>&{ingredientId?:string}
export type Draft=Record<typeof headerText[number],string|null>&Record<typeof headerNumbers[number],number|null>&{items:Item[];warnings:string[]}
export const emptyItem=():Item=>({name:null,description:null,unit:null,packageUnit:null,quantity:null,packageSize:null,unitPrice:null,lineTotal:null})
export const emptyDraft=():Draft=>({supplier:null,number:null,date:null,currency:null,subtotal:null,tax:null,discounts:null,total:null,items:[emptyItem()],warnings:[]})
function properties(strings:readonly string[],numbers:readonly string[]){
 return Object.fromEntries([...strings.map(k=>[k,{type:['string','null']}]),...numbers.map(k=>[k,{type:['number','null']}])])
}
export const schema={
 type:'object',required:[...headerText,...headerNumbers,'items','warnings'],
 properties:{...properties(headerText,headerNumbers),items:{type:'array',items:{type:'object',properties:properties(itemText,itemNumbers),required:[...itemText,...itemNumbers]}},warnings:{type:'array',items:{type:'string'}}}
}
function record(v:unknown):v is Record<string,unknown>{return typeof v==='object'&&v!==null&&!Array.isArray(v)}
function fields(v:Record<string,unknown>,strings:readonly string[],numbers:readonly string[]){
 return strings.every(k=>v[k]===null||(typeof v[k]==='string'&&v[k].length<=4000))&&numbers.every(k=>v[k]===null||(typeof v[k]==='number'&&Number.isFinite(v[k])&&Math.abs(v[k])<1e12))
}
export function isDraft(v:unknown):v is Draft{
 return record(v)&&fields(v,headerText,headerNumbers)&&Array.isArray(v.items)&&v.items.length<=200&&v.items.every(i=>record(i)&&Object.keys(i).every(k=>[...itemText,...itemNumbers].some(allowed=>allowed===k))&&fields(i,itemText,itemNumbers))&&Array.isArray(v.warnings)&&v.warnings.every(w=>typeof w==='string'&&w.length<=4000)
}
export function problems(d:Draft){
 const errors:string[]=[]
 for(const k of headerText)if(!d[k]?.trim())errors.push('Enter '+k+'.')
 for(const k of headerNumbers)if(d[k]===null||d[k]!<0)errors.push('Check '+k+'.')
 if(d.currency&&!/^[A-Z]{3}$/.test(d.currency))errors.push('Enter a three-letter currency.')
 if(d.date&&!/^\d{4}-\d{2}-\d{2}$/.test(d.date))errors.push('Use a calendar date in YYYY-MM-DD format.')
 if(!d.items.length)errors.push('Add at least one item.')
 const cents=(n:number)=>Math.round((n+Number.EPSILON)*100)
 let sum=0
 d.items.forEach((i,k)=>{
  if(!i.name?.trim()||!i.unit?.trim()||!(Number(i.quantity)>0)||!(Number(i.packageSize)>0)||i.unitPrice===null||i.unitPrice<0||i.lineTotal===null||i.lineTotal<0)errors.push('Complete the product, unit, quantity, pack and prices on row '+(k+1)+'.')
  if(i.quantity!==null&&i.unitPrice!==null&&i.lineTotal!==null&&cents(i.quantity*i.unitPrice)!==cents(i.lineTotal))errors.push('Quantity × unit price differs from line total on row '+(k+1)+'.')
  sum+=cents(i.lineTotal??0)
 })
 if(d.subtotal!==null&&sum!==cents(d.subtotal))errors.push('Line totals differ from the subtotal.')
 if(headerNumbers.every(k=>d[k]!==null)&&cents(d.total!)!==cents(d.subtotal!)-cents(d.discounts!)+cents(d.tax!))errors.push('Subtotal less discounts plus tax differs from total.')
 return errors
}
