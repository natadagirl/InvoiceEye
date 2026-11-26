import assert from 'node:assert/strict'
import {answerPurchases,validQuery} from '../supabase/functions/chat-assistant/evidence.ts'
const invoice=(date,amount,qty,price,supplier='A')=>({uuid:date+supplier,date,status:'ready',currency:'CAD',amount,supplierId:supplier,supplier,lines:[{productKey:'carrot',ingredient:'Carrots',specification:'whole',baseUnit:'kg',quantity:qty,packageSize:1,normalizedPrice:price}]})
const rows=[invoice('2026-10-04',10,10,1),invoice('2026-11-03',30,15,2),invoice('2026-11-03',10,10,1,'B'),invoice('2026-11-30',80,20,4)]
const query={from:'2026-11-01',through:'2026-11-30',baseline:'2026-10',ingredient:-1,supplier:-1}
const run=topic=>answerPurchases(rows,{...query,topic},'2026-11-25')
assert.equal(validQuery({...query,topic:'spend'},0,0),true)
assert.equal(validQuery({...query,topic:'spend',ingredient:1},1,1),false)
assert.equal(validQuery({...query,topic:'spend',from:'2026-02-30'},1,1),false)
assert.deepEqual(run('spend').rows,[['2','CAD 40.00']])
assert.deepEqual(run('prices').rows[0],['Carrots · A','100.0%','CAD 15.00','CAD 5.00'])
assert.deepEqual(run('concentration').rows[0],['A','CAD 30.00','75.0%'])
assert.equal(run('comparison').rows[0][1],'B')
assert.equal(run('savings').rows[0][3],'CAD 15.00')
assert.equal(run('unsupported').rows.length,0)
assert.ok(run('spend').sources[0].href.includes('until=2026-11-25'))
console.log('Assistant period, arithmetic, concentration, comparison, historical scenario and scope checks passed.')
