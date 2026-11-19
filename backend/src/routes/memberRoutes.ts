import type { Express, Request, Response } from "express";
import { randomBytes, randomUUID } from "node:crypto";
import { type PublicPlan } from "../../../shared/member";
import { hasPlus } from "../../../shared/plus";
import type { AuthService, Session, StoredUser } from "../services/authService";
import type { ProfileRepository } from "../services/profileService";
import type { MediaRecord, MediaRepository, ObjectStorage } from "../services/mediaService";
import type { CommunityRepository } from "../repositories/communityRepository";
import { currentMember, makePlan, MemberError, text, updateMember } from "../services/memberService";
import { validPushSubscription } from "../services/pushService";
export function installMemberRoutes(app:Express,deps:{
  auth:AuthService; profiles:ProfileRepository; media:MediaRepository; storage:ObjectStorage; bucket:string;
  repository:CommunityRepository; member(req:Request,res:Response):{user:StoredUser;session:Session}|null;
  admin(req:Request,res:Response):Session|null; blocked(a:string,b:string):boolean;
  persist():Promise<void>; privatePhoto(media:MediaRecord):Promise<{data:Buffer;mimeType:string}|null>;
  push:{publicKey:string;configured:boolean};
  privacyChanged?(key:string,hideProfile:boolean):void;
}) {
  const {auth,profiles,media,repository,member}=deps;
  const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response)=>{res.setHeader("Cache-Control","no-store");void fn(req,res).catch(e=>{if(!res.headersSent)res.status(e instanceof MemberError?e.status:503).json({code:e instanceof MemberError?e.code:"SERVICE_UNAVAILABLE",message:e instanceof MemberError?e.message:"Unable to save this change. Please retry."});});};
  async function save(userId:string, data:Partial<NonNullable<StoredUser["plusData"]>>) {const user=auth.getUser(userId);if(!user)throw new MemberError("NOT_FOUND","Member not found.",404);const r=auth.updatePlus(userId,{plusData:{...user.plusData,...data}});if(!r.ok)throw new MemberError(r.error.code,r.error.message);await deps.persist();}
  async function removeProof(userId:string) {const v=auth.getUser(userId)?.plusData?.photoVerification;if(v?.proofMediaId){const m=await media.getById(v.proofMediaId);if(m?.kind==="photo_verification" && m.userId===userId)await deps.storage.deleteObject?.({bucket:deps.bucket,key:m.objectKey});}}
  async function purgeProofs(){for(const id of auth.listRegisteredUserIds()){const v=auth.getUser(id)?.plusData?.photoVerification;if(v?.status==="pending"&&v.expiresAtMs<=Date.now()){await removeProof(id);await save(id,{photoVerification:{...v,status:"rejected",proofMediaId:undefined,reason:"Photo review request expired. Please submit again."}});}}}
  const cleanup=setInterval(()=>void purgeProofs().catch(()=>{}),3600000);cleanup.unref();void purgeProofs().catch(()=>{});
  app.get("/members/me",wrap(async(req,res)=>{const a=member(req,res);if(!a)return;let v=a.user.plusData?.photoVerification;const profile=await profiles.getByUserId(a.user.id);if(v?.status==="approved" && v.mainPhotoMediaId!==profile?.mainPhotoMediaId)v={...v,status:"outdated",reason:"Your main photo changed. Request a fresh review for the new photo."};res.json({preferences:currentMember(auth.getUser(a.user.id)?.plusData?.member),verification:v ?? null,plus:hasPlus(a.session)});}));
  app.put("/members/me",wrap(async(req,res)=>{const a=member(req,res);if(!a)return;const preferences=updateMember(a.user.plusData?.member,req.body,a.session);await save(a.user.id,{member:preferences});if(preferences.hideLocation || preferences.incognito || preferences.hideProfile)deps.privacyChanged?.(`user:${a.user.id}`,Boolean(preferences.incognito || preferences.hideProfile));res.json({preferences,plus:hasPlus(a.session),verification:auth.getUser(a.user.id)?.plusData?.photoVerification ?? null});}));
  app.post("/members/verification/challenge",wrap(async(req,res)=>{
    const a=member(req,res);if(!a)return;const p=await profiles.getByUserId(a.user.id);if(!p?.mainPhotoMediaId)throw new MemberError("PHOTO_REQUIRED","Add a main profile photo before requesting verification.");
    const previous=a.user.plusData?.photoVerification;if(previous?.status==="pending")throw new MemberError("PENDING_REVIEW","Your photo is awaiting review. Withdraw it before making a new request.",409);
    if(previous?.status==="challenge" && previous.expiresAtMs>Date.now())return res.json({verification:previous});
    await removeProof(a.user.id);
    const verification={status:"challenge" as const,challenge:randomBytes(3).toString("hex").toUpperCase(),expiresAtMs:Date.now()+15*60000,mainPhotoMediaId:p.mainPhotoMediaId};await save(a.user.id,{photoVerification:verification});res.json({verification});
  }));
  app.post("/members/verification/submit",wrap(async(req,res)=>{
    const a=member(req,res);if(!a)return;const current=auth.getUser(a.user.id)?.plusData?.photoVerification;
    if(!current || current.status!=="challenge" || current.expiresAtMs<=Date.now())throw new MemberError("EXPIRED_CHALLENGE","Request a fresh verification code.");
    const proof=await media.getById(String(req.body.mediaId ?? "")),p=await profiles.getByUserId(a.user.id);
    if(!proof || proof.userId!==a.user.id || proof.kind!=="photo_verification" || !proof.uploadedAtMs || proof.createdAtMs<current.expiresAtMs-15*60000 || p?.mainPhotoMediaId!==current.mainPhotoMediaId)throw new MemberError("INVALID_PROOF","Upload a new verification selfie for your current profile photo.");
    const verification={...current,status:"pending" as const,proofMediaId:proof.mediaId,submittedAtMs:Date.now(),expiresAtMs:Date.now()+7*86400000};await save(a.user.id,{photoVerification:verification});res.json({verification});
  }));
  app.delete("/members/verification",wrap(async(req,res)=>{const a=member(req,res);if(!a)return;await removeProof(a.user.id);await save(a.user.id,{photoVerification:undefined});res.json({ok:true});}));
  app.get("/admin/photo-verifications",wrap(async(req,res)=>{
    if(!deps.admin(req,res))return;const requests=[];
    for(const id of auth.listRegisteredUserIds()){const u=auth.getUser(id),v=u?.plusData?.photoVerification;if(!u || u.bannedAtMs || v?.status!=="pending")continue;
      if(v.expiresAtMs<=Date.now()){await removeProof(id);await save(id,{photoVerification:{...v,status:"rejected",proofMediaId:undefined,reason:"Review request expired. Please submit again."}});continue;}
      const p=await profiles.getByUserId(id);requests.push({userId:id,displayName:p?.displayName ?? "Member",verification:v,mainPhotoMediaId:p?.mainPhotoMediaId});}
    res.json({requests});
  }));
  app.get("/admin/photo-verifications/:userId/photo",wrap(async(req,res)=>{
    if(!deps.admin(req,res))return;const v=auth.getUser(req.params.userId)?.plusData?.photoVerification;
    if(v?.status!=="pending" || v.expiresAtMs<=Date.now() || !v.proofMediaId)throw new MemberError("NOT_FOUND","Pending proof not found.",404);
    const m=await media.getById(v.proofMediaId);if(!m || m.kind!=="photo_verification" || m.userId!==req.params.userId)throw new MemberError("NOT_FOUND","Photo not found.",404);
    const object=await deps.privatePhoto(m);if(!object)throw new MemberError("NOT_FOUND","Photo not found.",404);res.setHeader("Referrer-Policy","no-referrer");res.type(object.mimeType).send(object.data);
  }));
  app.post("/admin/photo-verifications/:userId/review",wrap(async(req,res)=>{
    const admin=deps.admin(req,res);if(!admin)return;if(admin.userId===req.params.userId)throw new MemberError("FORBIDDEN","Another administrator must review your photo.",403);
    const u=auth.getUser(req.params.userId),v=u?.plusData?.photoVerification,p=await profiles.getByUserId(req.params.userId);
    if(!u || u.bannedAtMs || v?.status!=="pending" || v.expiresAtMs<=Date.now())throw new MemberError("NOT_FOUND","Pending request not found.",404);
    if(typeof req.body.approve!=="boolean")throw new MemberError("INVALID_INPUT","Choose approve or reject.");
    if(req.body.approve && p?.mainPhotoMediaId!==v.mainPhotoMediaId)throw new MemberError("PHOTO_CHANGED","Profile photo changed. Reject this request and ask the member to submit again.",409);
    const reason=req.body.approve ? undefined:text(req.body.reason,180,"Review reason");await removeProof(u.id);
    await save(u.id,{photoVerification:{...v,proofMediaId:undefined,status:req.body.approve?"approved":"rejected",reviewedAtMs:Date.now(),reason}});res.json({ok:true});
  }));
  app.get("/notifications/push",wrap(async(req,res)=>{const a=member(req,res);if(!a)return;res.json({publicKey:deps.push.publicKey,configured:deps.push.configured});}));
  app.post("/notifications/push",wrap(async(req,res)=>{const a=member(req,res);if(!a)return;if(!deps.push.configured)throw new MemberError("NOT_CONFIGURED","Push notifications are not configured.",503);if(!validPushSubscription(req.body))throw new MemberError("INVALID_INPUT","Invalid browser push subscription.");const current=auth.getUser(a.user.id)?.plusData?.pushSubscriptions ?? [];if(current.length>=5 && !current.some(s=>s.endpoint===req.body.endpoint))throw new MemberError("LIMIT_REACHED","You can enable push on up to five browsers.");await save(a.user.id,{pushSubscriptions:[...current.filter(s=>s.endpoint!==req.body.endpoint),{endpoint:req.body.endpoint,keys:{p256dh:req.body.keys.p256dh,auth:req.body.keys.auth}}]});res.json({ok:true});}));
  app.delete("/notifications/push",wrap(async(req,res)=>{const a=member(req,res);if(!a)return;await save(a.user.id,{pushSubscriptions:a.user.plusData?.pushSubscriptions?.filter(s=>s.endpoint!==req.body.endpoint) ?? []});res.json({ok:true});}));
  function visible(hostId:string,userId:string){const host=auth.getUser(hostId);return Boolean(host && !host.bannedAtMs && !deps.blocked(`user:${hostId}`,`user:${userId}`));}
  app.get("/community/plans",wrap(async(req,res)=>{
    const a=member(req,res);if(!a)return;const now=Date.now(),all=await repository.plans();const city=typeof req.query.city==="string"?req.query.city.trim().toLowerCase():"";const category=req.query.category;
    const plans:PublicPlan[]=[];
    for(const p of all.filter(p=>!p.canceled && p.endsAtMs>now && visible(p.hostId,a.user.id) && (!city || p.city.toLowerCase().includes(city)) && (!category || p.category===category)).sort((a,b)=>a.startsAtMs-b.startsAtMs).slice(0,100)){
      const {attendees,...rest}=p;const profile=await profiles.getByUserId(p.hostId);plans.push({...rest,attendeeCount:attendees.length,joined:attendees.includes(a.user.id),hostName:profile?.displayName ?? "Member"});}
    res.json({plans});
  }));
  app.post("/community/plans",wrap(async(req,res)=>{const a=member(req,res);if(!a)return;const p=makePlan(req.body,a.user.id,randomUUID());await repository.update(s=>{s.plans=s.plans.filter(p=>p.endsAtMs>Date.now()-7*86400000);if(s.plans.filter(p=>p.hostId===a.user.id&&!p.canceled&&p.endsAtMs>Date.now()).length>=5)throw new MemberError("LIMIT_REACHED","You can host up to five upcoming plans.");s.plans.push(p);});res.json({id:p.id});}));
  app.post("/community/plans/:id/rsvp",wrap(async(req,res)=>{const a=member(req,res);if(!a)return;if(typeof req.body.join!=="boolean")throw new MemberError("INVALID_INPUT","Choose join or leave.");await repository.update(s=>{const p=s.plans.find(p=>p.id===req.params.id&&!p.canceled&&p.endsAtMs>Date.now());if(!p || !visible(p.hostId,a.user.id))throw new MemberError("NOT_FOUND","Plan not found.",404);if(p.hostId===a.user.id)throw new MemberError("HOST","Hosts can cancel their plan.");if(req.body.join && p.attendees.length>=100 && !p.attendees.includes(a.user.id))throw new MemberError("FULL","This plan has reached its RSVP limit.");p.attendees=[...new Set([...p.attendees.filter(id=>id!==a.user.id),...(req.body.join?[a.user.id]:[])])];});res.json({ok:true});}));
  app.delete("/community/plans/:id",wrap(async(req,res)=>{const a=member(req,res);if(!a)return;await repository.update(s=>{const p=s.plans.find(p=>p.id===req.params.id);if(!p)throw new MemberError("NOT_FOUND","Plan not found.",404);if(p.hostId!==a.user.id && a.session.role!=="admin")throw new MemberError("FORBIDDEN","Only the host or an administrator can cancel this plan.",403);p.canceled=true;});res.json({ok:true});}));
}
