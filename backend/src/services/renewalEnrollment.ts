import { LAUNCH_END_MS } from "../../../shared/plus";
export function scheduleParameters(userId:string,customerId:string,paymentMethod:string,priceId:string):URLSearchParams {
  return new URLSearchParams({customer:customerId,start_date:String(Math.floor(LAUNCH_END_MS/1000)),end_behavior:"release","metadata[userId]":userId,"default_settings[collection_method]":"charge_automatically","default_settings[default_payment_method]":paymentMethod,"phases[0][items][0][price]":priceId,"phases[0][items][0][quantity]":"1","phases[0][iterations]":"1","phases[0][metadata][userId]":userId,"phases[0][metadata][renewalConsent]":"stripe-hosted-setup","phases[0][default_payment_method]":paymentMethod});
}
