import {Brand} from './components/Brand'
import {StrictMode,useEffect,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {BrowserRouter,NavLink,Navigate,Route,Routes,useLocation} from 'react-router-dom'
import {Dashboard} from './pages/Dashboard'
import {Invoices,Tracker} from './pages/Workspace'
import {Icon,type IconName} from './components/Icon'
import {useAnalytics,useWorkspace} from './services/analytics'
import {Settings} from './pages/Settings'
import {Bell,AlertList,useNotifications} from './components/Notifications'
import {WorkspaceMenu} from './components/WorkspaceMenu'
import {Access} from './components/Access'
import {Insights} from './pages/Insights'
import './styles.css'
import {Assistant} from './components/Assistant'
const nav:{path:string;label:string;icon:IconName;desc:string}[]=[
 {path:'/',label:'Dashboard',icon:'dashboard',desc:'A snapshot of your restaurant’s purchasing activity.'},
 {path:'/invoices',label:'Invoices',icon:'invoices',desc:'Review supplier invoices and explore individual line items.'},
 {path:'/price-tracker',label:'Price Tracker',icon:'tracker',desc:'Follow ingredient prices and compare monthly changes.'},
 {path:'/ai-insights',label:'AI Insights',icon:'insights',desc:'Explore the purchasing patterns behind your invoices.'},
 {path:'/ai-assistant',label:'AI Assistant',icon:'insights',desc:'Explore your restaurant’s purchasing records.'},
 {path:'/settings',label:'Settings',icon:'settings',desc:'Manage your restaurant workspace preferences.'}]
function App(){
 const {pathname,search}=useLocation(),page=nav.find(p=>p.path===pathname||p.path==='/settings'&&pathname.startsWith('/settings/'))??(pathname==='/notifications'?{label:'Notifications',desc:'Review comparable supplier price increases.'}:nav[0])
 const {months}=useAnalytics(),{restaurant,rows}=useWorkspace()
 const notices=useNotifications()
 const [month,setMonth]=useState(months[months.length-1]),[menu,setMenu]=useState(false)
 useEffect(()=>{document.title=page.label+' | InvoiceEye';setMenu(false);window.scrollTo(0,0)},[pathname,page.label])
 useEffect(()=>{const target=new URLSearchParams(search).get('month');if(target&&months.includes(target))setMonth(target)},[search]) 
 function navItem(i:typeof nav[number]){return <NavLink key={i.path} end to={i.path} onClick={()=>setMenu(false)}><Icon name={i.icon} size={19}/>{i.label}</NavLink>}
 return <div className="app">{menu&&<button className="scrim" aria-label="Close navigation" onClick={()=>setMenu(false)}/>}<aside className={menu?'open':''}><div className="sidebarScroll"><Brand dark/><div className="navGroup">WORKSPACE</div><nav>{nav.slice(0,5).map(navItem)}</nav><div className="navGroup secondary">PREFERENCES</div><nav>{navItem(nav[5])}</nav></div><WorkspaceMenu closeDrawer={()=>setMenu(false)}/></aside><main><header><div className="crumb"><button className="menuBtn" onClick={()=>setMenu(!menu)} aria-label="Open navigation"><Icon name="menu"/></button><Icon name="store" size={16}/><span>Workspace</span><span className="slash">/</span><b>{page.label}</b></div><div className="authLinks">{restaurant.is_demo&&<div className="demo"><i/>Synthetic demo data</div>}<Bell state={notices}/></div></header><div className="content"><div className="heading"><div><div className="eyebrow"><i/>{pathname==='/'?'PURCHASING OVERVIEW':'RESTAURANT WORKSPACE'}</div><h1>{page.label}</h1><p>{page.desc}</p></div>{pathname!=='/notifications'&&!pathname.startsWith('/settings')&&pathname!=='/ai-assistant'&&!(pathname==='/invoices'&&new URLSearchParams(search).has('from'))&&<label className="period"><Icon name="calendar" size={17}/><select aria-label="Reporting month" value={month} onChange={e=>setMonth(e.target.value)}>{months.map(m=><option value={m} key={m}>{new Date(m+'-01T12:00:00').toLocaleDateString('en-CA',{month:'long',year:'numeric'})}</option>)}</select></label>}</div>{!rows.length&&pathname==='/'&&<p className="empty">Your restaurant has no invoices yet. Open Invoices to upload the first file.</p>}<Routes><Route path="/" element={<Dashboard month={month} alerts={notices.alerts.filter(a=>a.month===month)}/>}/><Route path="/invoices" element={<Invoices month={month}/>}/><Route path="/price-tracker" element={<Tracker month={month}/>}/><Route path="/ai-insights" element={<Insights key={month} month={month}/>}/><Route path="/ai-assistant" element={null}/><Route path="/notifications" element={<AlertList state={notices} full/>}/><Route path="/settings/:section?" element={<Settings key={pathname}/>}/><Route path="*" element={<Navigate replace to="/"/>}/></Routes><Assistant key={restaurant.id} month={month} menu={menu}/></div></main></div>
}
createRoot(document.getElementById('root')!).render(<StrictMode><BrowserRouter><Access><App/></Access></BrowserRouter></StrictMode>)
import './account.css'
