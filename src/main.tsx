import {StrictMode,useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter,NavLink,Navigate,Route,Routes,useLocation} from 'react-router-dom'
import {Dashboard} from './pages/Dashboard'
import {Invoices,Tracker,Insights,Settings} from './pages/Workspace'
import {Icon,type IconName} from './components/Icon'
import {useAnalytics,useWorkspace} from './services/analytics'
import {db} from './services/supabase'
import {Access,SignOut} from './components/Access'
import './styles.css'
const nav:{path:string;label:string;icon:IconName;desc:string}[]=[
 {path:'/',label:'Dashboard',icon:'dashboard',desc:'A snapshot of your restaurant’s purchasing activity.'},
 {path:'/invoices',label:'Invoices',icon:'invoices',desc:'Review supplier invoices and explore individual line items.'},
 {path:'/price-tracker',label:'Price Tracker',icon:'tracker',desc:'Follow ingredient prices and compare monthly changes.'},
 {path:'/ai-insights',label:'AI Insights',icon:'insights',desc:'Explore the purchasing patterns behind your invoices.'},
 {path:'/settings',label:'Settings',icon:'settings',desc:'Manage your restaurant workspace preferences.'}]
function App(){
 const {pathname}=useLocation(),page=nav.find(p=>p.path===pathname)??nav[0]
 const {months}=useAnalytics(),{restaurant,rows}=useWorkspace()
 const [month,setMonth]=useState(months[months.length-1]),[menu,setMenu]=useState(false)
 const [threshold,setThreshold]=useState(restaurant.alert_threshold),[error,setError]=useState('')
 useEffect(()=>{document.title=page.label+' | InvoiceEye';setMenu(false);window.scrollTo(0,0)},[page])
 async function updateThreshold(n:number){
  const {error}=await db!.from('restaurants').update({alert_threshold:n}).eq('id',restaurant.id).select('id').single()
  if(error)setError('Only a restaurant owner can save settings. '+error.message)
  else{restaurant.alert_threshold=n;setThreshold(n);setError('')}
 }
 function navItem(i:typeof nav[number]){return <NavLink key={i.path} end to={i.path} onClick={()=>setMenu(false)}><Icon name={i.icon} size={19}/>{i.label}</NavLink>}
 return <div className="app">{menu&&<button className="scrim" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}<aside className={menu?'open':''}><div className="brand"><span className="brandMark"><Icon name="eye" size={28}/></span>InvoiceEye</div><div className="navGroup">WORKSPACE</div><nav>{nav.slice(0,4).map(navItem)}</nav><div className="navGroup secondary">PREFERENCES</div><nav>{navItem(nav[4])}</nav><div className="restaurant"><div className="avatar">{restaurant.name.slice(0,2).toUpperCase()}</div><div><strong>{restaurant.name}</strong><small>Restaurant workspace</small></div></div></aside><main><header><div className="crumb"><button className="menuBtn" onClick={()=>setMenu(!menu)} aria-label="Open navigation"><Icon name="menu"/></button><Icon name="store" size={16}/><span>Workspace</span><span className="slash">/</span><b>{page.label}</b></div><div className="authLinks">{restaurant.is_demo&&<div className="demo"><i/>Synthetic demo data</div>}<SignOut/></div></header><div className="content"><div className="heading"><div><div className="eyebrow"><i/>{pathname==='/'?'PURCHASING OVERVIEW':'RESTAURANT WORKSPACE'}</div><h1>{page.label}</h1><p>{page.desc}</p></div>{pathname!=='/settings'&&<label className="period"><Icon name="calendar" size={17}/><select aria-label="Reporting month" value={month} onChange={e=>setMonth(e.target.value)}>{months.map(m=><option value={m} key={m}>{new Date(m+'-01T12:00:00').toLocaleDateString('en-CA',{month:'long',year:'numeric'})}</option>)}</select></label>}</div>{error&&<p role="alert">{error}</p>}{!rows.length&&pathname==='/'&&<p className="empty">Your restaurant has no invoices yet. Open Invoices to upload the first file.</p>}<Routes><Route path="/" element={<Dashboard month={month} threshold={threshold}/>}/><Route path="/invoices" element={<Invoices month={month}/>}/><Route path="/price-tracker" element={<Tracker month={month}/>}/><Route path="/ai-insights" element={<Insights/>}/><Route path="/settings" element={<Settings threshold={threshold} onChange={updateThreshold}/>}/><Route path="*" element={<Navigate replace to="/"/>}/></Routes></div></main></div>
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><Access><App/></Access></BrowserRouter></StrictMode>)
