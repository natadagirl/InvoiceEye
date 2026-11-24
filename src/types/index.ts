export type Line = {ingredient:string; unit:string; quantity:number; unitPrice:number}
export type Invoice = {id:string; date:string; supplier:string; lines:Line[]; status:'Paid'|'Pending'}
