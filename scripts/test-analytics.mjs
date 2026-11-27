import assert from 'node:assert/strict'
import {mock} from 'node:test'
import {periodSpend} from '../supabase/functions/_shared/metrics.ts'
import {analytics,reportingMonths,reportingMonthLabel} from '../src/services/analytics.ts'
const row=(date,price,pack,quantity,productKey='a',supplierId='s',currency='CAD')=>({
 date,status:'ready',currency,supplierId,supplier:supplierId,amount:price*quantity,
 lines:[{productKey,ingredient:'Tomatoes',specification:'Roma',baseUnit:'kg',quantity,packageSize:pack,normalizedPrice:price/pack}]
})
const model=analytics([
 row('2026-09-01',10,5,3),row('2026-10-01',24,10,1),row('2026-10-02',12,5,2),
 row('2026-10-02',200,5,2,'other-spec'),row('2026-10-02',99,5,2,'a','other-supplier'),
 row('2026-10-02',900,5,1,'a','s','USD'),row('2026-12-01',50,5,3)
])
const comparable=model.comparisons('2026-10').find(i=>i.key==='s/a')
assert.equal(comparable.price,2.4)
assert.equal(Math.round(comparable.delta),20)
assert.equal(model.monthlySpend('2026-10'),646)
assert.equal(model.comparisons('2026-12')[0].delta,null)
assert.equal(model.comparisons('2026-10').filter(i=>i.delta!==null).length,1)
console.log('Passed: normalized packs, supplier/specification isolation, currency filtering, missing previous month.')

// December has started in UTC, but the Edmonton reporting calendar is still in November.
mock.timers.enable({apis:['Date'],now:new Date('2026-12-01T05:59:00Z')})
try{
 const {current,available}=reportingMonths(model.months)
 assert.equal(current,'2026-11')
 assert.deepEqual(available,['2026-09','2026-10','2026-11','2026-12'])
 assert.deepEqual(reportingMonths([]).available,['2026-11'])
 assert.equal(reportingMonthLabel(current),'November 2026')
 assert.equal(reportingMonths([current]).available.length,1)
 const future=periodSpend([row('2026-12-01',50,5,3)],'2026-12','2026-11-30')
 assert.equal(future.scope,'Future-dated records')
 assert.equal(future.futureSpend,150)
 console.log('Passed: Edmonton month boundary, available historical and future periods, and future-record indicators.')
}finally{mock.timers.reset()}
