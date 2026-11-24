import assert from 'node:assert/strict'
import {analytics} from '../src/services/analytics.ts'
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
