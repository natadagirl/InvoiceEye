import assert from 'node:assert/strict'
import {emptyDraft,emptyItem,isDraft,problems} from '../supabase/functions/extract-invoice/format.ts'
const draft={...emptyDraft(),supplier:'Cedar Valley Produce',number:'S-1',date:'2026-12-02',currency:'CAD',subtotal:10,discounts:1,tax:0.45,total:9.45,items:[{...emptyItem(),name:'Carrots',quantity:2,unit:'case',packageSize:5,packageUnit:'kg',unitPrice:5,lineTotal:10}]}
assert.ok(isDraft(draft))
assert.deepEqual(problems(draft),[])
assert.ok(problems({...draft,total:10}).some(x=>x.includes('discounts')))
assert.ok(problems({...draft,items:[{...draft.items[0],quantity:3}]}).some(x=>x.includes('Quantity')))
assert.ok(problems(emptyDraft()).length>0)
assert.equal(isDraft({...draft,items:[{...draft.items[0],ingredientId:'injected'}]}),false)
assert.equal(isDraft({...draft,total:'9.45'}),false)
console.log('Passed extraction contract, incomplete fields, model match rejection and deterministic arithmetic.')
