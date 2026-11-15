export type MdProvider = {id:string;name:string;photoUrl:string;profileUrl:string;distanceLabel:string;liveUntilMs:number};
export type MdLink = {id:string;rdUserId:string;mdProviderId:string;keyHash:string;name:string;photoUrl:string;profileUrl:string;lat:number;lng:number;mdPaidUntilMs:number;liveUntilMs:number;updatedAtMs:number};
export type MdGrant = {id:string;mdGrantId:string;mdProviderId:string;viewerId:string;expiresAtMs:number;revoked?:boolean};
export type MdMessage = {messageId:string;providerId:string;viewerId:string;fromKey:string;toKey:string;text:string;createdAtMs:number;clientMessageId:string};
export type MdState = {links:MdLink[];grants:MdGrant[];messages:MdMessage[];tickets:{hash:string;viewerId:string;providerId:string;expiresAtMs:number}[];nonces:Record<string,number>;attempts:Record<string,number[]>};
export type MdAccount = {configured:boolean;plus:boolean;email:string;hasKey:boolean;keyCreatedAtMs?:number;link:{providerId:string;name:string;liveUntilMs:number;paidUntilMs:number}|null};
