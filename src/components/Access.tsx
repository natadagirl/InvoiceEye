import {useEffect,useState,type FormEvent,type ReactNode} from 'react'
import type {Session} from '@supabase/supabase-js'
import {db} from '../services/supabase'
import {loadInvoices} from '../services/purchasing'
import {WorkspaceContext} from '../services/analytics'
import type {Restaurant,Invoice} from '../types'
import {Icon} from './Icon'

function Frame({children}:{children:ReactNode}){
 return <div className="access"><div className="panel"><div className="brand"><span className="brandMark"><Icon name="eye"/></span>InvoiceEye</div>{children}</div></div>
}
function Auth({recover,done}:{recover:boolean;done:()=>void}){
 const [mode,setMode]=useState<'login'|'signup'|'reset'>('login'),[email,setEmail]=useState(''),[password,setPassword]=useState('')
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('')
 const title=recover?'Set a new password':({login:'Log in',signup:'Create account',reset:'Reset password'})[mode]
 async function submit(e:FormEvent){
  e.preventDefault();setBusy(true);setMessage('')
  try{
   const auth=db!.auth
   if(recover){const {error}=await auth.updateUser({password});if(error)throw error;done();return}
   if(mode==='reset'){const {error}=await auth.resetPasswordForEmail(email,{redirectTo:location.origin+'/reset-password'});if(error)throw error;setMessage('Check your inbox for a password reset link.')}
   if(mode==='signup'){const {error}=await auth.signUp({email,password,options:{emailRedirectTo:location.origin}});if(error)throw error;setMessage('Check your inbox to confirm your email.')}
   if(mode==='login'){const {error}=await auth.signInWithPassword({email,password});if(error)throw error}
  }catch(err){setMessage(err instanceof Error?err.message:'Authentication failed.')}finally{setBusy(false)}
 }
 return <Frame><h2>{title}</h2><form onSubmit={submit}>{!recover&&<label>Email<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>}{(recover||mode!=='reset')&&<label>Password<input required type="password" minLength={mode==='login'&&!recover?1:8} autoComplete={mode==='login'&&!recover?'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)}/></label>}<button disabled={busy}>{busy?'Please wait…':title}</button></form>{!recover&&<div className="authLinks">{(['login','signup','reset'] as const).filter(m=>m!==mode).map(m=><button key={m} onClick={()=>{setMode(m);setMessage('');setPassword('')}}>{({login:'Log in',signup:'Create account',reset:'Forgot password?'})[m]}</button>)}</div>}<p role="status">{message}</p></Frame>
}
function Membership({user,children}:{user:string;children:ReactNode}){
 const [restaurants,setRestaurants]=useState<Restaurant[]|null>(null),[selected,setSelected]=useState(''),[name,setName]=useState('')
 const [error,setError]=useState(''),[version,refresh]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>{let current=true;setError('');setRestaurants(null)
 void (async()=>{const {data,error}=await db!.from('restaurants').select('id,name,is_demo,alert_threshold').order('name');if(!current)return;if(error)setError(error.message);else setRestaurants(data)})()
 return ()=>{current=false}},[user,version])
 async function onboard(e:FormEvent){e.preventDefault();setBusy(true);const {error}=await db!.rpc('onboard_restaurant',{restaurant_name:name});setBusy(false);if(error)setError(error.message);else refresh(n=>n+1)}
 const restaurant=restaurants?.find(r=>r.id===selected)??restaurants?.[0]
 if(error)return <Frame><p role="alert">{error}</p><button onClick={()=>refresh(n=>n+1)}>Retry</button> · <SignOut/></Frame>
 if(!restaurants)return <Frame>Loading restaurants…</Frame>
 if(!restaurant)return <Frame><h2>Create your restaurant</h2><form onSubmit={onboard}><label>Restaurant name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><button disabled={busy}>Create workspace</button></form><SignOut/></Frame>
 return <>{restaurants.length>1&&<label className="workspaceSwitch">Restaurant <select value={restaurant.id} onChange={e=>setSelected(e.target.value)}>{restaurants.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}<Data key={restaurant.id} restaurant={restaurant}>{children}</Data></>
}
function Data({restaurant,children}:{restaurant:Restaurant;children:ReactNode}){
 const [rows,setRows]=useState<Invoice[]|null>(null),[error,setError]=useState(''),[revision,reload]=useState(0)
 useEffect(()=>{let active=true;setRows(null);setError('')
 loadInvoices(restaurant.id).then(data=>{if(active)setRows(data)}).catch(e=>{if(active)setError(e.message)})
 return ()=>{active=false}},[restaurant.id,revision])
 if(error)return <Frame><p>{error}</p><button onClick={()=>reload(n=>n+1)}>Retry</button> · <SignOut/></Frame>
 if(!rows)return <Frame>Loading invoices…</Frame>
 return <WorkspaceContext.Provider value={{rows,restaurant,refresh:()=>reload(n=>n+1)}}>{children}</WorkspaceContext.Provider>
}
export function SignOut(){
 const [error,setError]=useState('')
 return <><button onClick={async()=>{const {error}=await db!.auth.signOut({scope:'local'});if(error)setError(error.message)}}>Log out</button>{error&&<span role="alert">{error}</span>}</>
}
export function Access({children}:{children:ReactNode}){
 const [session,setSession]=useState<Session|null|undefined>(undefined),[recover,setRecover]=useState(location.pathname==='/reset-password')
 useEffect(()=>{if(!db)return;const {data}=db.auth.onAuthStateChange((event,s)=>{setSession(s);if(event==='PASSWORD_RECOVERY')setRecover(true)});return ()=>data.subscription.unsubscribe()},[])
 if(!db)return <Frame>Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to connect InvoiceEye.</Frame>
 if(session===undefined)return <Frame>Loading session…</Frame>
 if(!session||recover)return <Auth recover={Boolean(session)&&recover} done={()=>{location.replace('/')}}/>
 return <Membership key={session.user.id} user={session.user.id}>{children}</Membership>
}
