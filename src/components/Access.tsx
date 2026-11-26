import {Brand} from './Brand'
import {createContext,useContext,useEffect,useState,type FormEvent,type ReactNode} from 'react'
import type {Session,User} from '@supabase/supabase-js'
import {AuthForms,EmailCallback} from './AuthForms'
import {db} from '../services/supabase'
import {loadInvoices} from '../services/purchasing'
import {WorkspaceContext} from '../services/analytics'
import type {Restaurant,Invoice} from '../types'

const Identity=createContext<User|null>(null)
export function useIdentity(){return useContext(Identity)!}
function Frame({children}:{children:ReactNode}){
 return <div className="access"><div className="panel"><Brand/>{children}</div></div>
}
function Membership({user,children}:{user:string;children:ReactNode}){
 const [restaurants,setRestaurants]=useState<Restaurant[]|null>(null),[selected,setSelected]=useState(''),[name,setName]=useState('')
 const [error,setError]=useState(''),[version,refresh]=useState(0),[busy,setBusy]=useState(false)
 useEffect(()=>{let current=true;setError('');setRestaurants(null)
 void (async()=>{const {data,error}=await db!.from('restaurants').select('id,name,is_demo,alert_threshold,alerts_enabled').order('name');if(!current)return;if(error)setError(error.message);else setRestaurants(data)})()
 return ()=>{current=false}},[user,version])
 async function onboard(e:FormEvent){e.preventDefault();setBusy(true);const {error}=await db!.rpc('onboard_restaurant',{restaurant_name:name});setBusy(false);if(error)setError(error.message);else refresh(n=>n+1)}
 const restaurant=restaurants?.find(r=>r.id===selected)??restaurants?.[0]
 if(error)return <Frame><p role="alert">{error}</p><button onClick={()=>refresh(n=>n+1)}>Retry</button> · <SignOut/></Frame>
 if(!restaurants)return <Frame>Loading restaurants…</Frame>
 if(!restaurant)return <Frame><h2>Create your restaurant</h2><form onSubmit={onboard}><label>Restaurant name<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><button disabled={busy}>Create workspace</button></form><SignOut/></Frame>
 return <>{restaurants.length>1&&<label className="workspaceSwitch">Restaurant <select value={restaurant.id} onChange={e=>setSelected(e.target.value)}>{restaurants.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>}<Data key={restaurant.id} restaurant={restaurant} setRestaurant={next=>setRestaurants(list=>list!.map(r=>r.id===next.id?next:r))}>{children}</Data></>
}
function Data({restaurant,setRestaurant,children}:{restaurant:Restaurant;setRestaurant:(r:Restaurant)=>void;children:ReactNode}){
 const [rows,setRows]=useState<Invoice[]|null>(null),[error,setError]=useState(''),[revision,reload]=useState(0)
 useEffect(()=>{let active=true;setRows(null);setError('')
 loadInvoices(restaurant.id).then(data=>{if(active)setRows(data)}).catch(e=>{if(active)setError(e.message)})
 return ()=>{active=false}},[restaurant.id,revision])
 if(error)return <Frame><p>{error}</p><button onClick={()=>reload(n=>n+1)}>Retry</button> · <SignOut/></Frame>
 if(!rows)return <Frame>Loading invoices…</Frame>
 return <WorkspaceContext.Provider value={{rows,restaurant,setRestaurant,refresh:()=>reload(n=>n+1)}}>{children}</WorkspaceContext.Provider>
}
export function SignOut(){
 const [error,setError]=useState('')
 return <><button onClick={async()=>{const {error}=await db!.auth.signOut({scope:'local'});if(error)setError(error.message)}}>Log out</button>{error&&<span role="alert">{error}</span>}</>
}
export function Access({children}:{children:ReactNode}){
 const [session,setSession]=useState<Session|null|undefined>(undefined),[recover,setRecover]=useState(false)
 const [tokenCallback]=useState(()=>new URLSearchParams(location.search).has('token_hash')||/[#&?]error(?:_code)?=/.test(location.href))
 useEffect(()=>{if(!db)return;const {data}=db.auth.onAuthStateChange((event,s)=>{setSession(s);if(event==='PASSWORD_RECOVERY')setRecover(true)});return ()=>data.subscription.unsubscribe()},[])
 if(!db)return <Frame>Configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to connect InvoiceEye.</Frame>
 if(session===undefined)return <Frame>Loading session…</Frame>
 if(recover)return <Frame><AuthForms initial="recovery"/></Frame>
 if(location.pathname==='/reset-password'||location.pathname==='/auth/callback'){
 const reset=location.pathname==='/reset-password'
 if(!reset&&!tokenCallback&&session?.user.email_confirmed_at){return <Frame><h2>Email verified</h2><a href="/">Continue to InvoiceEye</a></Frame>}
 return <Frame><EmailCallback recovery={reset} onVerified={()=>reset?setRecover(true):location.replace('/')}/></Frame>
 }
 if(!session)return <Frame><AuthForms/></Frame>
 if(!session.user.email_confirmed_at)return <Frame><h2>Verify your email</h2><p>Use your confirmation link before opening the workspace.</p><SignOut/></Frame>
 return <Identity.Provider value={session.user}><Membership key={session.user.id} user={session.user.id}>{children}</Membership></Identity.Provider>
}
