import {useEffect,useState,type FormEvent} from 'react'
import {NavLink,useParams} from 'react-router-dom'
import {db} from '../services/supabase'
import {useWorkspace} from '../services/analytics'
import {useIdentity} from '../components/Access'
import {settingsLinks} from '../components/WorkspaceMenu'

export function Settings(){
 const {section='account'}=useParams(),{restaurant,setRestaurant}=useWorkspace(),user=useIdentity()
 const [display,setDisplay]=useState(''),[name,setName]=useState(restaurant.name),[threshold,setThreshold]=useState(restaurant.alert_threshold),[enabled,enable]=useState(restaurant.alerts_enabled)
 const [owner,setOwner]=useState(false),[ready,setReady]=useState(false),[reload,load]=useState(0),[busy,save]=useState(false),[message,say]=useState(''),[error,fail]=useState('')
 useEffect(()=>{let active=true
 Promise.all([db!.from('profiles').select('display_name').eq('id',user.id).single(),db!.from('restaurant_members').select('role').eq('user_id',user.id).eq('restaurant_id',restaurant.id).single()]).then(([profile,member])=>{
 if(!active)return
 if(!profile.data||!member.data){fail('Settings could not be loaded.');return}
 setDisplay(profile.data.display_name??'');setOwner(member.data.role==='owner');setReady(true)})
 return ()=>{active=false}},[user.id,restaurant.id,reload])
 async function submit(e:FormEvent<HTMLFormElement>){
 e.preventDefault();const form=e.currentTarget,values=new FormData(form);say('');fail('');save(true)
 try{
 if(form.name==='password'){
 const password=String(values.get('password'))
 if(password!==values.get('confirm'))throw Error('The new passwords do not match.')
 const {error}=await db!.auth.updateUser({password,current_password:String(values.get('current'))})
 if(error)throw error
 form.reset();say('Password updated.')
 }else if(section==='account'){
 const r=await db!.from('profiles').update({display_name:display.trim()}).eq('id',user.id).select('display_name').single()
 if(r.error)throw r.error;setDisplay(r.data.display_name);say('Display name saved.')
 }else{
 const updates=section==='restaurant'?{name:name.trim()}:{alerts_enabled:enabled,alert_threshold:threshold}
 const r=await db!.from('restaurants').update(updates).eq('id',restaurant.id).select('id,name,is_demo,alerts_enabled,alert_threshold').single()
 if(r.error)throw r.error;setRestaurant(r.data);setName(r.data.name);say('Workspace preferences saved.')
 }
 }catch(e){fail(e instanceof Error?e.message:'Changes could not be saved.')}finally{save(false)}
 }
 return <div className="settingsLayout"><div className="settingsTabs">{settingsLinks.map(([id,label])=><NavLink className={section===id?'selected':''} key={id} to={'/settings/'+id}>{label}</NavLink>)}</div>
 {error&&<p className="reviewError" role="alert">{error} {!ready&&<button onClick={()=>{fail('');load(n=>n+1)}}>Retry</button>}</p>}
 {!ready?!error&&<p role="status">Loading settings…</p>:section==='account'?<>
 <form className="panel settingsForm" onSubmit={submit}><h2>Personal information</h2><label>Display name<input maxLength={100} autoComplete="name" value={display} onChange={e=>setDisplay(e.target.value)}/></label><label>Registered email<input type="email" readOnly value={user.email??''}/></label><small>{user.email_confirmed_at?'Email verified':'Email awaiting verification'}</small><button className="primary" disabled={busy}>Save changes</button></form>
 <form name="password" className="panel settingsForm" onSubmit={submit}><h2>Change password</h2>{[['current','Current password'],['password','New password'],['confirm','Confirm new password']].map(([n,label])=><label key={n}>{label}<input name={n} required type="password" minLength={n==='current'?1:8} autoComplete={n==='current'?'current-password':'new-password'}/></label>)}<button className="primary" disabled={busy}>Change password</button></form></>:
 <form className="panel settingsForm" onSubmit={submit}><h2>{section==='restaurant'?'Restaurant settings':'Notification preferences'}</h2>
 {section==='restaurant'?<><label>Restaurant name<input required maxLength={100} disabled={!owner} value={name} onChange={e=>setName(e.target.value)}/></label><label>Reporting currency<input readOnly value="Canadian dollar (CAD)"/></label><label>Reporting time zone<input readOnly value="America/Edmonton"/></label></>:<><label><input type="checkbox" checked={enabled} disabled={!owner} onChange={e=>enable(e.target.checked)}/> Enable in-app price alerts</label><label>Price increase threshold<select disabled={!owner} value={threshold} onChange={e=>setThreshold(Number(e.target.value))}>{[5,10,15,20].map(n=><option value={n} key={n}>{n}%</option>)}</select></label></>}
 {owner?<button className="primary" disabled={busy||section==='restaurant'&&!name.trim()}>Save changes</button>:<small>Only a restaurant owner can edit these preferences.</small>}</form>}
 <p role="status">{busy?'Saving…':message}</p></div>
}
