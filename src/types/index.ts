export type Line = {
  ingredient:string; unit:string; quantity:number; unitPrice:number; lineTotal:number;
  productKey:string|null; specification:string; baseUnit:string; packageSize:number; normalizedPrice:number;
}
export type Invoice = {
  uuid:string; id:string; date:string; supplier:string; supplierId:string|null; lines:Line[];
  status:string; amount:number|null; currency:string; file:string|null;
}
export type Restaurant = {id:string; name:string; is_demo:boolean; alerts_enabled:boolean;alert_threshold:number}
