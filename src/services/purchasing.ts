import {db} from './supabase'
import type {Invoice,Line} from '../types'

async function pages<T>(fetchPage:(from:number,to:number)=>PromiseLike<{data:T[]|null;error:{message:string}|null}>){
 const rows:T[]=[]
 for(;;){
  const {data,error}=await fetchPage(rows.length,rows.length+199)
  if(error) throw new Error(error.message)
  if(!data?.length) return rows
  rows.push(...data)
 }
}
export async function loadInvoices(restaurant:string):Promise<Invoice[]>{
 const [headers,items]=await Promise.all([
  pages((a,b)=>db!.from('invoices').select('id,invoice_number,invoice_date,supplier_id,suppliers(name),processing_status,total_amount,currency,original_file_path').eq('restaurant_id',restaurant).order('invoice_date',{ascending:false}).order('id').range(a,b)),
  pages((a,b)=>db!.from('invoice_items').select('invoice_id,ingredient_id,original_product_name,quantity,unit,package_size,unit_price,normalized_unit_price,line_total,ingredients(name,specification,base_unit)').eq('restaurant_id',restaurant).order('id').range(a,b))
 ])
 const byInvoice=new Map<string,Line[]>()
 for(const item of items){
  const product=item.ingredients as unknown as {name:string;specification:string;base_unit:string}|null
  const lines=byInvoice.get(item.invoice_id)??[]
  lines.push({ingredient:product?.name??item.original_product_name,productKey:item.ingredient_id,specification:product?.specification??'',baseUnit:product?.base_unit??'',unit:item.unit,quantity:item.quantity,unitPrice:item.unit_price,lineTotal:item.line_total,packageSize:item.package_size,normalizedPrice:item.normalized_unit_price})
  byInvoice.set(item.invoice_id,lines)
 }
 return headers.map(h=>({uuid:h.id,id:h.invoice_number??h.id.slice(0,8),date:h.invoice_date,supplier:(h.suppliers as unknown as {name:string}|null)?.name??'Awaiting review',supplierId:h.supplier_id,lines:byInvoice.get(h.id)??[],status:h.processing_status,amount:h.total_amount,currency:h.currency,file:h.original_file_path}))
}
