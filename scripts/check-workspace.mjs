// Smoke-test the application's actual query mapper and calculations with an ordinary demo session.
import assert from 'node:assert/strict'
import {createServer} from 'vite'
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {db}=await server.ssrLoadModule('/src/services/supabase.ts')
 const {loadInvoices}=await server.ssrLoadModule('/src/services/purchasing.ts')
 const {analytics}=await server.ssrLoadModule('/src/services/analytics.ts')
 const {error}=await db.auth.signInWithPassword({email:process.env.DEMO_EMAIL,password:process.env.DEMO_PASSWORD})
 if(error)throw error
 const result=await db.from('restaurants').select('id,alert_threshold').eq('is_demo',true).single()
 if(result.error)throw result.error
 const model=analytics(await loadInvoices(result.data.id))
 assert.equal(model.months.length,6)
 assert.equal(model.inMonth('2026-11').length,15)
 assert.equal(model.prices('2026-11').length,35)
 const nov=model.comparisons('2026-11')
 assert.ok(nov.some(x=>x.delta<0))
 assert.ok(nov.some(x=>x.delta>10))
 assert.ok(model.monthlySpend('2026-11')>0)
 console.log('Verified demo dashboard from the frontend query service:',model.months.length,'months, November spend CAD',model.monthlySpend('2026-11').toFixed(2),'and',nov.filter(x=>x.delta>=result.data.alert_threshold).length,'alerts.')
 await db.auth.signOut()
}finally{await server.close()}
