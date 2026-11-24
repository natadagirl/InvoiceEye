import assert from 'node:assert/strict'
import {calculate,periodSpend} from '../supabase/functions/_shared/metrics.ts'
const row=(uuid,date,supplier,quantity,price,currency='CAD',product='tomato')=>({
 uuid,date,status:'ready',supplierId:supplier,supplier,currency,amount:quantity*price,
 lines:[{productKey:product,ingredient:'Tomatoes',specification:product,baseUnit:'kg',quantity,packageSize:1,normalizedPrice:price}]
})
const rows=[row('a','2026-09-03','Farm',10,4),row('b','2026-09-24','Farm',6,4),row('c','2026-10-05','Farm',8,5),
 row('d','2026-10-06','Market',4,3),row('e','2026-10-28','Farm',2,5),row('f','2026-10-06','Foreign',90,1,'USD'),
 row('g','2026-10-06','Other',1,1,'CAD','unmatched specification'),{...row('h','2026-10-06','Farm',8,9),status:'awaiting_review'}]
const v=calculate(rows,'2026-10',1,'2026-10-15')
assert.equal(v.coverage.total,63);assert.equal(v.coverage.future,1)
assert.equal(v.monthly[0].spend,53);assert.equal(v.monthly[0].before,40);assert.equal(v.monthly[0].delta,32.5)
assert.equal(v.changes[0].priceEffect,10);assert.equal(v.changes[0].volumeEffect,-24)
assert.equal(v.alternatives.length,1);assert.equal(v.alternatives[0].estimate,20)
assert.equal(periodSpend(rows,'2026-10','2026-09-01').delta,null)
assert.equal(periodSpend(rows,'2026-12','2026-12-15').delta,null)
console.log('Passed period coverage, partial-month baseline, spend, price/volume effects, matching and historical savings.')
