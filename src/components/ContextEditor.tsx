import {useEffect,useState} from 'react'
import {db} from '../services/supabase'
import {useWorkspace} from '../services/analytics'
type Choice={id:string;name:string;specification?:string;base_unit?:string}
export type Interpretation={query:{from:string;through:string;topic:string};ingredientId?:string;supplierId?:string;ingredientName?:string;supplierName?:string}
export type Correction={turn:string;from:string;through:string;ingredientId?:string;supplierId?:string}
function Catalog({table,label,selected,choose}:{table:'ingredients'|'suppliers';label:string;selected?:string;choose:(id:string)=>void}){
 const {restaurant}=useWorkspace(),[term,search]=useState(''),[page,setPage]=useState(0),[items,setItems]=useState<Choice[]>([]),[state,set]=useState('Loading…')
 useEffect(()=>{let alive=true;set('Loading…')
 const timer=setTimeout(async()=>{const escaped=term.trim().replace(/[\\%_]/g,'\\$&')
 const r=await db!.from(table).select(table==='ingredients'?'id,name,specification,base_unit':'id,name').eq('restaurant_id',restaurant.id).ilike('name','%'+escaped+'%').order('name').order('id').range(page*10,page*10+10)
 if(!alive)return;set(r.error?'Search unavailable.':r.data?.length?'':'No matches.');setItems(r.error?[]:r.data as unknown as Choice[])},150)
 return()=>{alive=false;clearTimeout(timer)}},[table,term,page,restaurant.id])
 return <fieldset><legend>{label}</legend><input aria-label={'Search '+label} placeholder={'Search '+label.toLowerCase()} value={term} onChange={e=>{search(e.target.value);setPage(0)}}/><select aria-label={label} value={selected??''} onChange={e=>choose(e.target.value)}><option value="">All {label.toLowerCase()}</option>{selected&&!items.some(x=>x.id===selected)&&<option value={selected}>Current selection</option>}{items.slice(0,10).map(i=><option key={i.id} value={i.id}>{[i.name,i.specification,i.base_unit].filter(Boolean).join(' · ')}</option>)}</select><small role="status">{state}</small><div><button type="button" disabled={!page} onClick={()=>setPage(page-1)}>Previous</button> <button type="button" disabled={items.length<=10} onClick={()=>setPage(page+1)}>Next</button></div></fieldset>
}
export function ContextEditor({id,value,busy,rerun}:{id:string;value:Interpretation;busy:boolean;rerun:(v:Correction)=>void}){
 const [open,set]=useState(false),[from,start]=useState(value.query.from),[through,end]=useState(value.query.through),[ingredient,product]=useState(value.ingredientId),[supplier,vendor]=useState(value.supplierId)
 if(['report','unsupported'].includes(value.query.topic))return null
 return <div className="contextEditor"><button aria-expanded={open} onClick={()=>set(!open)}>Adjust question scope</button>{[value.ingredientName,value.supplierName].filter(Boolean).map((s,i)=><small key={i}> · {s}</small>)}{open&&<form onSubmit={e=>{e.preventDefault();rerun({turn:id,from,through,...(ingredient?{ingredientId:ingredient}:{}),...(supplier?{supplierId:supplier}:{})});set(false)}}><label>From<input type="date" required max={through} value={from} onChange={e=>start(e.target.value)}/></label><label>Through<input type="date" required min={from} value={through} onChange={e=>end(e.target.value)}/></label><Catalog label="Ingredients" table="ingredients" selected={ingredient} choose={product}/><Catalog label="Suppliers" table="suppliers" selected={supplier} choose={vendor}/><button className="primary" disabled={busy}>Run corrected question</button></form>}</div>
}
