import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import { hasPlus } from "../../../shared/plus";
import type { AuthService, Session, StoredUser } from "../services/authService";
import type { ProfileRepository } from "../services/profileService";
import type { MediaRecord, MediaRepository, ObjectStorage } from "../services/mediaService";
import { currentMember, MemberError, text, updateMember } from "../services/memberService";
import { validPushSubscription } from "../services/pushService";
export function installMemberRoutes(app:Express,deps:{
  auth:AuthService; profiles:ProfileRepository; media:MediaRepository; storage:ObjectStorage; bucket:string;
  member(req:Request,res:Response):{user:StoredUser;session:Session}|null;
  admin(req:Request,res:Response):Session|null;
  persist():Promise<void>; privatePhoto(media:MediaRecord):Promise<{data:Buffer;mimeType:string}|null>;
  push:{publicKey:string;configured:boolean};
  privacyChanged?(key:string,hideProfile:boolean):void;
}) {
  const {auth,profiles,media,member}=deps;
  const wrap=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response)=>{res.setHeader("Cache-Control","no-store");void fn(req,res).catch(e=>{if(!res.headersSent)res.status(e instanceof MemberError?e.status:503).json({code:e instanceof MemberError?e.code:"SERVICE_UNAVAILABLE",message:e instanceof MemberError?e.message:"Unable to save this change. Please retry."});});};
  async function save(userId:string, data:Partial<NonNullable<StoredUser["plusData"]>>) {const user=auth.getUser(userId);if(!user)throw new MemberError("NOT_FOUND","Member not found.",404);const r=auth.updatePlus(userId,{plusData:{...user.plusData,...data}});if(!r.ok)throw new MemberError(r.error.code,r.error.message);await deps.persist();}
  async function removeProof(userId:string) {const v=auth.getUser(userId)?.plusData?.photoVerification;if(v?.proofMediaId){const m=await media.getById(v.proofMediaId);if(m?.kind==="photo_verification" && m.userId===userId)await deps.storage.deleteObject?.({bucket:deps.bucket,key:m.objectKey});}}
  async function purgeProofs(){for(const id of auth.listRegisteredUserIds()){const v=auth.getUser(id)?.plusData?.photoVerification;if(v?.status==="pending"&&v.expiresAtMs<=Date.now()){await removeProof(id);await save(id,{photoVerification:{...v,status:"rejected",proofMediaId:undefined,reason:"Photo review request expired. Please submit again."}});}}}
  const cleanup=setInterval(()=>void purgeProofs().catch(()=>{}),3600000);cleanup.unref();void purgeProofs().catch(()=>{});
  app.get("/members/me",wrap(async(req,res)=>{const a=member(req,res);if(!a)return;let v=a.user.plusData?.photoVerification;const profile=await profiles.getByUserId(a.user.id);if(v?.status==="approved" && v.mainPhotoMediaId!==profile?.mainPhotoMediaId)v={...v,status:"outdated",reason:"Your main photo changed. Request a fresh review for the new photo."};res.json({preferences:currentMember(auth.getUser(a.user.id)?.plusData?.member),verification:v ?? null,plus:hasPlus(a.session)});}));
  app.put("/members/me",wrap(async(req,res)=>{const a=member(req,res);if(!a)return;const preferences=updateMember(a.user.plusData?.member,req.body,a.session);await save(a.user.id,{member:preferences});if(preferences.hideLocation || preferences.incognito || preferences.hideProfile)deps.privacyChanged?.(`user:${a.user.id}`,Boolean(preferences.incognito || preferences.hideProfile));res.json({preferences,plus:hasPlus(a.session),verification:auth.getUser(a.user.id)?.plusData?.photoVerification ?? null});}));
  app.get("/members/automatic-replies", wrap(async (req, res) => {
    const actor = member(req, res);
    if (!actor) return;
    const setting = actor.user.plusData?.customerImport;
    res.json({ available: setting?.completed === true, enabled: setting?.autoReplies === true });
  }));
  app.delete("/members/automatic-replies", wrap(async (req, res) => {
    const actor = member(req, res);
    if (!actor) return;
    const setting = actor.user.plusData?.customerImport;
    if (!setting?.completed) throw new MemberError("NOT_FOUND", "Automatic replies are unavailable.", 404);
    await save(actor.user.id, { customerImport: { ...setting, autoReplies: false } });
    res.json({ enabled: false });
  }));
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
  app.all(["/community/plans", "/community/plans/:id", "/community/plans/:id/rsvp"], (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(410).json({ code: "FEATURE_RETIRED", message: "Public plans are no longer available. Use private groups instead." });
  });
}
