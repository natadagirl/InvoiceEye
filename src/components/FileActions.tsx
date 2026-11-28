import {Review} from './Review'
import {useState} from 'react'
import {db} from '../services/supabase'
import {useWorkspace} from '../services/analytics'
export function Upload(){
 const {restaurant,refresh}=useWorkspace()
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 const [review,setReview]=useState<{id:string;path:string}|null>(null)
 async function upload(file:File){
  if(busy||review)return
  const ext=file.name.split('.').pop()?.toLowerCase()
  if(!ext||!['pdf','jpg','jpeg','png'].includes(ext)||!['application/pdf','image/jpeg','image/png'].includes(file.type)||file.size>10485760){setError('Choose a PDF, JPEG or PNG up to 10 MiB.');return}
  setBusy(true);setError('')
  try{const id=crypto.randomUUID();const path=restaurant.id+'/'+id+'.'+ext
   const result=await db!.storage.from('invoices').upload(path,file,{cacheControl:'0'})
   if(result.error)throw result.error
   setReview({id,path})
  }catch(e){setError(e instanceof Error?e.message:'Upload failed.')}finally{setBusy(false)}
 }
 return <><div className="uploadZone" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const file=e.dataTransfer.files[0];if(file)void upload(file)}}><label>Drop a PDF, JPEG or PNG here (up to 10 MiB), or {busy?'Uploading…':'Upload an invoice'} <input type="file" accept=".pdf,.jpg,.jpeg,.png" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void upload(file)}}/></label>{error&&<p role="alert">{error}</p>}</div>{review&&<Review {...review} onClose={()=>{setReview(null);refresh()}}/>}</>
}
export function FileActions({path}:{path:string}){
 const {refresh}=useWorkspace(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function act(remove:boolean){
  if(remove&&!window.confirm('Permanently delete this invoice file? The invoice record will be retained.'))return
  setBusy(true)
  try{
   const bucket=db!.storage.from('invoices')
   if(remove){const {data,error}=await bucket.remove([path]);if(error)throw error;if(!data?.length)throw new Error('The file could not be removed.');refresh()}
   else{const {data,error}=await bucket.download(path,{cacheNonce:crypto.randomUUID()},{cache:'no-store'});if(error)throw error;const url=URL.createObjectURL(data);const link=document.createElement('a');link.href=url;link.download=path.split('/').pop()!;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  }catch(e){setError(e instanceof Error?e.message:'File operation failed.')}finally{setBusy(false)}
 }
 return <div className="setting"><button disabled={busy} onClick={()=>act(false)}>Download file</button><button disabled={busy} onClick={()=>act(true)}>Delete file</button>{error&&<p role="alert">{error}</p>}</div>
}
