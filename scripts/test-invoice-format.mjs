import {existingSupplier,matchIngredient} from '../src/services/invoiceMatching.ts'
import assert from 'node:assert/strict'
import {actionableNotes,emptyDraft,emptyItem,isDraft,problems} from '../supabase/functions/extract-invoice/format.ts'
const draft={...emptyDraft(),supplier:'Cedar Valley Produce',number:'S-1',date:'2026-12-02',currency:'CAD',subtotal:10,discounts:1,tax:0.45,total:9.45,items:[{...emptyItem(),name:'Carrots',quantity:2,unit:'case',packageSize:5,packageUnit:'kg',unitPrice:5,lineTotal:10}]}
assert.ok(isDraft(draft))
assert.deepEqual(problems(draft),[])
assert.ok(problems({...draft,total:10}).some(x=>x.includes('discounts')))
assert.ok(problems({...draft,items:[{...draft.items[0],quantity:3}]}).some(x=>x.includes('Quantity')))
assert.ok(problems(emptyDraft()).length>0)
assert.equal(isDraft({...draft,items:[{...draft.items[0],ingredientId:'injected'}]}),false)
assert.equal(isDraft({...draft,total:'9.45'}),false)
console.log('Passed extraction contract, incomplete fields, model match rejection and deterministic arithmetic.')

assert.deepEqual(problems({...draft,discounts:0,total:10.45}),[])
assert.match(problems({...draft,discounts:null}).join(' '),/use 0 if the invoice has no discount/)
assert.ok(problems({...draft,date:'2026-02-30'}).some(issue=>issue.includes('calendar date')))
assert.ok(problems({...draft,items:[{...draft.items[0],packageSize:0}]}).some(issue=>issue.includes('positive quantity and pack size')))
assert.deepEqual(actionableNotes(['Check discounts.','Check prices.','Verify quantities.','Review invoice details.','Pack size missing for Roma tomatoes.']),['Pack size missing for Roma tomatoes.'])
assert.deepEqual(problems({...draft,subtotal:20,total:19.45,items:[...draft.items,...draft.items]}),[])

const product=(id,name,base_unit='kg',specification='Standard')=>({id,name,base_unit,specification})
const roma=product('roma','Roma Tomatoes'), carrots=product('carrot','Carrots')
const match=(name,unit='kg',catalog=[roma,carrots])=>matchIngredient(name,unit,catalog)
for(const name of ['CARROTS',' Carrots ','carrot'])assert.equal(match(name).automatic?.id,carrots.id)
for(const name of ['Roma Tomato','Roma Tomatoes','Tomatoes, Roma','TOMATO, ROMA'])assert.equal(match(name).automatic?.id,roma.id)
assert.equal(match('Roma Tomatoes','each').automatic,undefined)
assert.equal(match('Roma Tomatoes',null).automatic,undefined)
for(const name of ['Organic Tomatoes','Cherry Tomatoes','Unlisted Produce'])assert.equal(match(name).automatic,undefined)
assert.equal(match('Fresh Roma Tomatoes').automatic,undefined)
assert.equal(match('Fresh Roma Tomatoes').suggested[0]?.id,roma.id)
assert.equal(match('Roma Tomatoes','kg',[roma,product('second','Roma Tomatoes','kg','Organic')]).automatic,undefined)
assert.equal(existingSupplier('  prairie fresh  ',['Prairie Fresh']),'Prairie Fresh')
assert.equal(existingSupplier('Other',[]),undefined)
console.log('Passed exact, equivalent, ambiguous and incompatible ingredient matching, supplier reuse, and actionable validation.')
