import {useEffect,useRef,useState} from 'react'
import {db} from '../services/supabase'
import {useWorkspace} from '../services/analytics'
import {emptyDraft,emptyItem,headerText,headerNumbers,itemNumbers,isDraft,problems,type Draft,type Item} from '../../supabase/functions/extract-invoice/format'

type Product={id:string;name:string;specification:string;base_unit:string}
type Props={id:string;path:string;onClose:()=>void}
const names:Record<string,string>={supplier:'Supplier',number:'Invoice number',date:'Invoice date',currency:'Currency',subtotal:'Subtotal',tax:'Tax',discounts:'Discounts',total:'Total',name:'Product name',description:'Description',quantity:'Quantity',unit:'Purchased unit',packageSize:'Pack size',packageUnit:'Base unit',unitPrice:'Unit price',lineTotal:'Line total'}
function AmountField({value,onChange,label}:{value:number|null;onChange:(v:number|null)=>void;label:string}){
 const [editing,setEditing]=useState<string|null>(null)
 return <input aria-label={label} type="number" step="any" value={editing??(value===null?'':value.toFixed(2))}
 onFocus={()=>setEditing(value===null?'':String(value))} onBlur={()=>setEditing(null)}
 onChange={e=>{setEditing(e.target.value);onChange(e.target.value===''?null:Number(e.target.value))}}/>
}
export function Review({id,path,onClose}:Props){
 const {restaurant,refresh}=useWorkspace()
 const dialog=useRef<HTMLDialogElement>(null)
 const [draft,setDraft]=useState<Draft>(emptyDraft),[products,setProducts]=useState<Product[]>([]),[suppliers,setSuppliers]=useState<string[]>([])
 const [status,setStatus]=useState('uploaded'),[busy,setBusy]=useState('Loading invoice…'),[error,setError]=useState(''),[preview,setPreview]=useState('')
 const [dirty,setDirty]=useState(false)
 useEffect(()=>{
  dialog.current?.showModal()
  let alive=true,url=''
  async function load(){
   const [row,catalog,vendors,file]=await Promise.all([
    db!.from('invoices').select('extraction,extraction_error,processing_status').eq('id',id).single(),
    db!.from('ingredients').select('id,name,specification,base_unit').eq('restaurant_id',restaurant.id).order('name'),
    db!.from('suppliers').select('name').eq('restaurant_id',restaurant.id).order('name'),
    db!.storage.from('invoices').download(path,{cacheNonce:crypto.randomUUID()},{cache:'no-store'})
   ])
   if(!alive)return
   if(row.error||catalog.error||vendors.error)throw new Error('Could not load the invoice or matching catalog. Reopen to retry.')
   setProducts(catalog.data);setSuppliers(vendors.data.map(v=>v.name))
   setStatus(row.data.processing_status);setError(row.data.extraction_error??'')
   if(isDraft(row.data.extraction))setDraft(row.data.extraction)
   if(file.data){url=URL.createObjectURL(path.endsWith('.pdf')?new Blob([file.data],{type:'application/pdf'}):file.data);setPreview(url)}else setError('File preview unavailable.')
  }
  load().catch(e=>{if(alive)setError(e.message)}).finally(()=>{if(alive)setBusy('')})
  return ()=>{alive=false;if(url)URL.revokeObjectURL(url)}
 },[id,path,restaurant.id])
 useEffect(()=>{if(!dirty)return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',warn);return ()=>window.removeEventListener('beforeunload',warn)},[dirty])
 function change(next:Draft){setDraft(next);setDirty(true)}
 function line(index:number,patch:Partial<Item>){change({...draft,items:draft.items.map((i,k)=>k===index?{...i,...patch}:i)})}
 function close(){if(!busy&&(!dirty||window.confirm('Close and lose your unsaved edits?')))onClose()}
 async function run(action:'extract'|'confirm'|'discard'){
  if(action==='discard'&&!window.confirm('Discard this draft? Its file will remain in your restaurant.'))return
  if(action==='extract'&&dirty&&!window.confirm('Replace your edits with a new extraction?'))return
  setBusy(action==='extract'?'Reading invoice with Gemini…':'Saving…');setError('')
  try{
   if(action==='extract'){
    const {data,error}=await db!.functions.invoke('extract-invoice',{body:{invoiceId:id}})
    if(error){const body=await error.context?.json?.().catch(()=>null);throw new Error(body?.error??'Extraction request failed. Retry when connected.')}
    if(!isDraft(data?.draft))throw new Error('Invalid extraction response.')
    setDraft(data.draft);setStatus('awaiting_review');setDirty(false)
   }else{
    const result=action==='confirm'?await db!.rpc('confirm_invoice',{iid:id,draft}):await db!.rpc('discard_invoice',{iid:id})
    if(result.error)throw new Error(result.error.code==='23505'?'This supplier and invoice number already exist.':result.error.message)
    refresh();onClose()
   }
  }catch(e){
   setError(e instanceof Error?e.message:'Request failed.')
   if(action==='extract'){const {data}=await db!.from('invoices').select('processing_status').eq('id',id).maybeSingle();if(data)setStatus(data.processing_status)}
  }finally{setBusy('')}
 }
 const issues=problems(draft)
 draft.items.forEach((item,index)=>{
  const matched=products.find(p=>p.id===item.ingredientId)
  if(matched&&matched.base_unit!==item.packageUnit)issues.push('Row '+(index+1)+' must express the pack size in '+matched.base_unit+' for '+matched.name+'.')
 })
 const editable=['awaiting_review','failed'].includes(status)
 return <dialog className="review" ref={dialog} aria-labelledby="review-heading" onCancel={e=>{e.preventDefault();close()}}>
  <div className="panelHead"><div><h2 id="review-heading">Review invoice</h2><p>{status.replaceAll('_',' ')} · {restaurant.name}</p></div><button disabled={!!busy} onClick={close}>Close</button></div>
  <div className="reviewBody"><div className="originalPane">{preview&&<details open><summary>Original invoice</summary>{path.endsWith('.pdf')?<iframe title="Original PDF" src={preview}/>:<img alt="Original supplier invoice" src={preview}/>}<a href={preview} download={path.split('/').pop()}>Download original</a></details>}</div><div className="editPane">
  <div className="reviewActions"><button disabled={!!busy} onClick={()=>run('extract')}>{editable||status==='processing'?'Retry extraction':'Extract with Gemini'}</button><span role="status">{busy}</span></div>
  {error&&<p className="reviewError" role="alert">{error}</p>}
  {editable&&<fieldset disabled={!!busy}><legend>Invoice details</legend>
   <datalist id="supplier-options">{suppliers.map(s=><option key={s}>{s}</option>)}</datalist>
   <div className="reviewFields">{headerText.map(k=><label key={k}>{names[k]}<input type={k==='date'?'date':'text'} list={k==='supplier'?'supplier-options':undefined} value={draft[k]??''} onChange={e=>change({...draft,[k]:e.target.value||null})}/></label>)}{headerNumbers.map(k=><label key={k}>{names[k]}<AmountField label={names[k]} value={draft[k]} onChange={v=>change({...draft,[k]:v})}/></label>)}</div>
   <h3>Line items</h3><p>Verify each match and the base units per purchased pack.</p>
   {draft.items.map((i,index)=>{
    const suggested=products.filter(p=>i.name?.toLowerCase().includes(p.name.toLowerCase()))
    return <section className="reviewLine" key={index}><div className="lineTop"><h3>Line {index+1}</h3><button onClick={()=>change({...draft,items:draft.items.filter((_,n)=>n!==index)})}>Remove</button></div>
    <label>Product name<textarea value={i.name??''} rows={2} onChange={e=>line(index,{name:e.target.value||null})}/></label>
    <label>Ingredient match<select aria-label={'Ingredient match row '+(index+1)} value={i.ingredientId??''} onChange={e=>line(index,{ingredientId:e.target.value})}><option value="">Leave unmatched</option>{products.map(p=><option key={p.id} value={p.id}>{p.name} · {p.specification} / {p.base_unit}</option>)}</select></label>
    {suggested.filter(p=>p.id!==i.ingredientId).map(p=><button key={p.id} className="suggestion" onClick={()=>line(index,{ingredientId:p.id})}>Use {p.name} · {p.specification} / {p.base_unit}</button>)}
    <label>Description<textarea rows={2} value={i.description??''} onChange={e=>line(index,{description:e.target.value||null})}/></label>
    <div className="reviewFields">{(['unit','packageUnit'] as const).map(k=><label key={k}>{names[k]}<input value={i[k]??''} onChange={e=>line(index,{[k]:e.target.value||null})}/></label>)}
    {itemNumbers.map(k=><label key={k}>{names[k]}{k==='lineTotal'||k==='unitPrice'?<AmountField label={names[k]+' row '+(index+1)} value={i[k]} onChange={v=>line(index,{[k]:v})}/>:<input type="number" step="any" value={i[k]??''} onChange={e=>line(index,{[k]:e.target.value===''?null:Number(e.target.value)})}/>}</label>)}</div>
    </section>})}<button className="outline" onClick={()=>change({...draft,items:[...draft.items,emptyItem()]})}>Add line item</button>
   {draft.warnings.length>0&&<div className="reviewNotes"><strong>Extractor notes</strong>{draft.warnings.map((s,i)=><p key={i}>{s}</p>)}</div>}
   {issues.length>0&&<div className="reviewNotes"><strong>Before confirmation</strong>{issues.map(s=><p key={s}>{s}</p>)}</div>}
   </fieldset>}</div></div>
   <div className="reviewActions reviewFooter"><button disabled={!!busy} onClick={()=>run('discard')}>Discard draft</button>{editable&&<button className="primary" disabled={!!busy||issues.length>0} onClick={()=>run('confirm')}>Confirm and save</button>}</div>
 </dialog>
}
