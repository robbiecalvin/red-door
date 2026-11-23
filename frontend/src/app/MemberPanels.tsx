import { EXPLOITATION_REPORT_REASON, UNDERAGE_REPORT_REASON } from "../../../shared/childSafety";
import React, { useEffect, useRef, useState } from "react";
import { DEFAULT_MEMBER, INTERESTS, INTENTS, PROFILE_PROMPTS, PROFILE_LINK_LABELS, RIGHT_NOW_DURATIONS_MINUTES, isRightNow, type ProfileLinkPlatform, type ProfileLinks, type MemberSettings, type MemberPreferences, type PublicMember, type PhotoVerification } from "../../../shared/member";
import { apiClient, uploadToLocalSignedUrl, type Session } from "./api";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";
type Props={api:ReturnType<typeof apiClient>;session:Session};
export function useMember({api,session}:Props){
  const [data,setData]=useState<MemberSettings|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function refresh(){if(!session.userId)return;try{setData(await api.memberRequest<MemberSettings>(session.sessionToken,"/members/me"));setError("");}catch(e){setError((e as Error).message);}}
  useEffect(()=>{void refresh();const update=()=>void refresh();window.addEventListener("rd:member-updated",update);return()=>window.removeEventListener("rd:member-updated",update);},[api,session.sessionToken,session.tier,session.plusExpiresAtMs]);
  async function save(input:unknown){setBusy(true);setError("");try{const next=await api.memberRequest<MemberSettings>(session.sessionToken,"/members/me",input,"PUT");setData(next);window.dispatchEvent(new Event("rd:member-updated"));return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
  return {data,error,busy,save,refresh};
}
export function IntentBadge({member}:{member?:PublicMember}){if(!member?.intent || (member.intentExpiresAtMs ?? 0)<=Date.now())return null;return <span className={`rd-intent-badge intent-${member.intent}`}>{INTENTS[member.intent]}</span>;}
export function VerifiedBadge({verified}:{verified?:boolean}){return verified?<span className="rd-verified-badge" title="A reviewer compared a submitted selfie with this profile photo. This is not an identity or safety guarantee."><Icon name="shield" />Photo reviewed</span>:null;}
function useRightNow(expiresAtMs?: number): boolean {
  const [, refresh] = useState(0);
  useEffect(() => {
    if (!isRightNow(expiresAtMs)) return;
    const timer = window.setTimeout(() => refresh(value => value + 1), expiresAtMs! - Date.now());
    return () => window.clearTimeout(timer);
  }, [expiresAtMs]);
  return isRightNow(expiresAtMs);
}

export function RightNowBadge({ expiresAtMs }: { expiresAtMs?: number }) {
  return useRightNow(expiresAtMs)
    ? <span className="rd-right-now-badge"><Icon name="lightning" active />Right Now</span>
    : null;
}

export function RightNowControl(props: Props) {
  const { data, error, busy, save } = useMember(props);
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState(60);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("");
  const [scheduleError, setScheduleError] = useState("");
  const [, refresh] = useState(0);
  const startsAt = data?.preferences.rightNowStartsAtMs;
  const expiresAt = data?.preferences.rightNowExpiresAtMs;
  const scheduled = startsAt !== undefined && startsAt > Date.now();
  const active = useRightNow(scheduled ? undefined : expiresAt);

  useEffect(() => {
    if (!scheduled || startsAt === undefined) return;
    const timer = window.setTimeout(() => refresh(value => value + 1),
      Math.min(2_147_483_647, Math.max(0, startsAt - Date.now())));
    return () => window.clearTimeout(timer);
  });

  function close() {
    setOpen(false);
    setScheduleOpen(false);
    setScheduledTime("");
    setScheduleError("");
  }

  async function saveSchedule(event: React.FormEvent) {
    event.preventDefault();
    const startsAtMs = new Date(scheduledTime).getTime();
    if (!Number.isFinite(startsAtMs) || startsAtMs <= Date.now()) {
      setScheduleError("Choose a future start time.");
      return;
    }
    setScheduleError("");
    if (await save({ rightNowStartsAtMs: startsAtMs, rightNowDurationMinutes: duration })) close();
  }

  return <>
    <button type="button" className="rd-btn rd-icon-only-btn rd-explore-icon" aria-label={active ? "Right Now is active" : "Right Now"}
      title="Right Now" aria-haspopup="dialog" aria-expanded={open} data-active={active} onClick={() => setOpen(true)}>
      <Icon name="lightning" className="rd-ui-icon" active={active} />
    </button>
    {open ? <Sheet title="Right Now" onClose={close}>
      <div className="rd-right-now-menu">
        {active && expiresAt !== undefined ? <p>Available until {new Date(expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p> : null}
        {scheduled && startsAt !== undefined && expiresAt !== undefined ? <p>
          Starts {new Date(startsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {(expiresAt - startsAt) / 60_000} minutes
        </p> : null}
        {!active ? <label className="rd-field">
          <span>How long are you available?</span>
          <select className="rd-input" value={duration} disabled={busy} onChange={event => setDuration(Number(event.target.value))}>
            {RIGHT_NOW_DURATIONS_MINUTES.map(minutes => <option key={minutes} value={minutes}>{minutes} minutes</option>)}
          </select>
        </label> : null}
        <div className="rd-row">
          <button type="button" className="rd-btn primary" disabled={busy || !data}
            onClick={() => void save(active ? { rightNow: false } : { rightNow: true, rightNowDurationMinutes: duration }).then(ok => { if (ok) close(); })}>
            {active ? "Turn off" : "Turn on now"}
          </button>
          {!active ? <button type="button" className="rd-btn" disabled={busy || !data} aria-expanded={scheduleOpen}
            onClick={() => { setScheduleError(""); setScheduleOpen(!scheduleOpen); }}>
            {scheduleOpen ? "Close schedule" : scheduled ? "Change schedule" : "Schedule for later"}
          </button> : null}
          {scheduled ? <button type="button" className="rd-btn" disabled={busy || !data}
            onClick={() => void save({ rightNow: false }).then(ok => { if (ok) close(); })}>Cancel schedule</button> : null}
        </div>
        {scheduleOpen && !active ? <form onSubmit={event => void saveSchedule(event)}>
          <label className="rd-field"><span>Start time (local)</span>
            <input className="rd-input" type="datetime-local" value={scheduledTime} required
              onChange={event => setScheduledTime(event.target.value)} />
          </label>
          <button className="rd-btn primary" type="submit" disabled={busy || !data}>Save schedule</button>
          {scheduleError ? <p role="alert" className="rd-error">{scheduleError}</p> : null}
        </form> : null}
        {error ? <p role="alert" className="rd-error">{error}</p> : null}
      </div>
    </Sheet> : null}
  </>;
}
export function MemberEditor(props:Props){
  const {data,error,busy,save}=useMember(props),[interests,setInterests]=useState<string[]>([]),[prompts,setPrompts]=useState([{prompt:PROFILE_PROMPTS[0] as string,answer:""}]),[message,setMessage]=useState("");
  const loaded=useRef(false);
  useEffect(()=>{if(data && !loaded.current){loaded.current=true;setInterests(data.preferences.interests);setPrompts(data.preferences.prompts.length?data.preferences.prompts:[{prompt:PROFILE_PROMPTS[0],answer:""}]);}},[data]);
  if(!props.session.userId)return null;
  return <section className="rd-card rd-member-editor"><div className="rd-eyebrow">GIVE THEM A WAY IN</div><h2>More than a photo.</h2><p className="rd-muted">A few shared interests and a good prompt make the first hello easier.</p><h3>Your interests <small>{interests.length}/8</small></h3><div className="rd-interest-picker">{INTERESTS.map(i=><button key={i} className="rd-interest-chip" aria-pressed={interests.includes(i)} disabled={busy || !interests.includes(i)&&interests.length>=8} onClick={()=>setInterests(prev=>prev.includes(i)?prev.filter(x=>x!==i):[...prev,i])}>{i}</button>)}</div><h3>Conversation starters</h3>{prompts.map((item,index)=><div className="rd-prompt-editor" key={index}><label className="rd-field"><span>Prompt {index+1}</span><select className="rd-input" value={item.prompt} onChange={e=>setPrompts(prev=>prev.map((p,n)=>n===index?{...p,prompt:e.target.value}:p))}>{PROFILE_PROMPTS.map(p=><option key={p}>{p}</option>)}</select></label><label className="rd-field"><span>Your answer</span><textarea className="rd-input" aria-label={`Your answer to prompt ${index+1}`} maxLength={180} value={item.answer} onChange={e=>setPrompts(prev=>prev.map((p,n)=>n===index?{...p,answer:e.target.value}:p))} placeholder="Something that makes it easy to say hello…" /></label><button className="rd-btn" onClick={()=>setPrompts(prev=>prev.filter((_,n)=>n!==index))}>Remove prompt {index+1}</button></div>)}<div className="rd-row">{prompts.length<3?<button className="rd-btn" onClick={()=>{const next=PROFILE_PROMPTS.find(p=>!prompts.some(item=>item.prompt===p))!;setPrompts(prev=>[...prev,{prompt:next,answer:""}]);}}>Add a prompt</button>:null}<button className="rd-btn primary" disabled={busy||!data} onClick={()=>void save({interests,prompts:prompts.filter(p=>p.answer.trim())}).then(ok=>setMessage(ok?"Interests and prompts saved.":""))}>Save interests & prompts</button></div>{message?<p role="status">{message}</p>:null}{error?<p className="rd-error" role="alert">{error}</p>:null}</section>;
}
function ProfileLinkField({ platform, saved, disabled, onSave }: {
  platform: ProfileLinkPlatform;
  saved?: ProfileLinks[ProfileLinkPlatform];
  disabled: boolean;
  onSave(link: ProfileLinks[ProfileLinkPlatform] | null): Promise<boolean>;
}): React.ReactElement {
  const label = PROFILE_LINK_LABELS[platform];
  const [url, setUrl] = useState(saved?.url ?? "");
  const [visible, setVisible] = useState(saved?.visible ?? false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setUrl(saved?.url ?? "");
    setVisible(saved?.visible ?? false);
  }, [saved?.url, saved?.visible]);

  return <form className="rd-profile-link-field" onSubmit={event => {
    event.preventDefault();
    setMessage("");
    const value = url.trim();
    void onSave(value ? { url: value, visible } : null).then(ok => {
      if (ok) setMessage(`${label} link ${value ? "saved" : "removed"}.`);
    });
  }}>
    <label className="rd-field"><span>{label} profile URL</span>
      <input type="url" className="rd-input" value={url} maxLength={500} disabled={disabled}
        onChange={event => { setUrl(event.target.value); setMessage(""); }} />
    </label>
    <label className="rd-row"><input type="checkbox" checked={visible} disabled={disabled || !url.trim()}
      onChange={event => { setVisible(event.target.checked); setMessage(""); }} />Show {label} on my profile</label>
    <button type="submit" className="rd-btn" disabled={disabled}>Save {label}</button>
    {message ? <p role="status">{message}</p> : null}
  </form>;
}

export function MemberProfileLinks(props: Props): React.ReactElement | null {
  const { data, busy, error, save } = useMember(props);
  if (!props.session.userId) return null;
  return <section className="rd-card rd-settings-body">
    <h2>Profile links</h2>
    <p className="rd-caption">Links are hidden by default. Turn on a link to share it with signed-in adult members who can view your profile. Clear the URL and save to remove it.</p>
    {(Object.keys(PROFILE_LINK_LABELS) as ProfileLinkPlatform[]).map(platform =>
      <ProfileLinkField key={platform} platform={platform} saved={data?.preferences.profileLinks?.[platform]}
        disabled={busy || !data} onSave={link => save({ profileLinks: { [platform]: link } })} />)}
    {error ? <p role="alert" className="rd-error">{error}</p> : null}
  </section>;
}

export function ProfileExternalLinks({ member }: { member?: PublicMember }): React.ReactElement | null {
  const links = member?.profileLinks;
  if (!links || !Object.keys(links).length) return null;
  return <nav className="rd-row" aria-label="External profile links">
    {(Object.keys(PROFILE_LINK_LABELS) as ProfileLinkPlatform[]).map(platform => links[platform] ?
      <a key={platform} className="rd-btn" href={links[platform]} target="_blank" rel="noopener noreferrer">{PROFILE_LINK_LABELS[platform]}</a> : null)}
  </nav>;
}

export function MemberPrivacy(props:Props){
  const {data,error,busy,save}=useMember(props);if(!props.session.userId)return null;
  return <section className="rd-card rd-settings-body"><h2>Your location. Your choice.</h2><p className="rd-muted">Map coordinates are randomized and distances are approximate. Location sharing is optional.</p><label className="rd-setting-toggle"><span><strong>Hide my location</strong><small>Remove your map presence and distance from discovery. Your profile can still appear in People.</small></span><input type="checkbox" checked={data?.preferences.hideLocation ?? false} disabled={busy||!data} onChange={e=>void save({hideLocation:e.target.checked})} /></label><label className="rd-setting-toggle"><span><strong>Hide my profile</strong><small>Remove your personal profile from the People grid and map. Existing chats remain available.</small></span><input type="checkbox" checked={Boolean(data?.preferences.hideProfile || data?.preferences.incognito)} disabled={busy||!data} onChange={e=>{void save({hideProfile:e.target.checked,incognito:false});}} /></label><p className="rd-caption">These settings stop future discovery and location updates; they cannot erase information someone already saw. Blocking and reporting remain free.</p>{error?<p role="alert" className="rd-error">{error}</p>:null}</section>;
}
export function ProfileConversation({member,onReply}:{member?:PublicMember;onReply?(excerpt:string):void}){if(!member)return null;return <section className="rd-profile-conversation"><ProfileExternalLinks member={member} /><VerifiedBadge verified={member.photoVerified}/><IntentBadge member={member}/>{member.interests.length?<div className="rd-interest-picker">{member.interests.map(i=><span className="rd-interest-chip" key={i}>{i}</span>)}</div>:null}{member.prompts.map(p=><div className="rd-profile-prompt" key={p.prompt}><span>{p.prompt}</span><p>{p.answer}</p>{onReply && <button className="rd-btn" onClick={()=>onReply(`${p.prompt} ${p.answer}`)}>Reply to this answer</button>}</div>)}</section>;}
export function PhotoVerificationPanel(props:Props){
  const {data,error,refresh}=useMember(props),[busy,setBusy]=useState(false),[message,setMessage]=useState("");if(!props.session.userId)return null;
  const verification=data?.verification;
  async function run(action:()=>Promise<void>){setBusy(true);setMessage("");try{await action();await refresh();window.dispatchEvent(new Event("rd:member-updated"));}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
  async function upload(file:File){const init=await props.api.initiateMediaUpload(props.session.sessionToken,{kind:"photo_verification",mimeType:file.type,sizeBytes:file.size});if(!await uploadToLocalSignedUrl(init.uploadUrl,file,file.type)){const r=await fetch(init.uploadUrl,{method:"PUT",headers:{"Content-Type":file.type},body:file});if(!r.ok)throw new Error("Selfie upload failed.");}await props.api.completeMediaUpload(props.session.sessionToken,init.mediaId);await props.api.memberRequest(props.session.sessionToken,"/members/verification/submit",{mediaId:init.mediaId});}
  return <section className="rd-card rd-settings-body"><div className="rd-eyebrow">AN EXTRA SIGNAL OF TRUST</div><h2>Photo review</h2><p className="rd-muted">Add a main profile photo, then send a fresh selfie holding your review code on paper. An administrator compares the photos. This does not verify your identity or guarantee anyone’s safety.</p><strong>Status: {verification?.status ?? "Not submitted"}</strong>{verification?.status==="challenge"?<><p>Hold this code next to your face: <strong className="rd-verification-code">{verification.challenge}</strong></p><p className="rd-caption">Upload within 15 minutes. Your selfie is private and visible only to administrators reviewing your request.</p><label className="rd-field"><span>Upload verification selfie</span><input type="file" aria-label="Upload verification selfie" accept="image/jpeg,image/png,image/webp" capture="user" disabled={busy} onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void run(()=>upload(file));}} /></label></>:null}{verification?.status==="pending"?<p className="rd-muted">Awaiting admin review. Pending selfies are deleted after review, withdrawal, or seven days. Review times depend on administrator availability.</p>:null}{verification?.reason?<p>{verification.reason}</p>:null}<div className="rd-row">{verification?.status!=="pending"?<button className="rd-btn" disabled={busy||!data} onClick={()=>void run(async()=>{await props.api.memberRequest(props.session.sessionToken,"/members/verification/challenge",{});})}>{verification?.status==="approved"?"Review a new photo":"Get review code"}</button>:null}{verification?<button className="rd-btn" disabled={busy} onClick={()=>void run(async()=>{await props.api.memberRequest(props.session.sessionToken,"/members/verification",undefined,"DELETE");})}>Withdraw photo review</button>:null}</div><p className="rd-caption">Changing your main photo removes the badge until the new photo is reviewed.</p>{message||error?<p role="status">{message||error}</p>:null}</section>;
}
export function PhotoReviewQueue(props:Props){
  type Review={userId:string;displayName:string;verification:PhotoVerification;mainPhotoMediaId?:string};
  const [requests,setRequests]=useState<Review[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false),[photo,setPhoto]=useState<{proof:string;main:string;id:string}|null>(null),[reason,setReason]=useState("The selfie, code, and current profile photo could not be matched.");
  async function refresh(){try{const r=await props.api.memberRequest<{requests:Review[]}>(props.session.sessionToken,"/admin/photo-verifications");setRequests(r.requests);}catch(e){setError((e as Error).message);}}
  useEffect(()=>{if(props.session.role==="admin")void refresh();},[props.api,props.session.sessionToken]);useEffect(()=>()=>{if(photo)URL.revokeObjectURL(photo.proof);},[photo]);
  if(props.session.role!=="admin")return null;
  async function show(r:Review){setBusy(true);try{const blob=await props.api.memberPhoto(props.session.sessionToken,r.userId);const main=r.mainPhotoMediaId?(await props.api.getPublicMediaUrl(r.mainPhotoMediaId)).downloadUrl:"";setPhoto({proof:URL.createObjectURL(blob),main,id:r.userId});}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  async function review(r:Review,approve:boolean){setBusy(true);try{await props.api.memberRequest(props.session.sessionToken,`/admin/photo-verifications/${encodeURIComponent(r.userId)}/review`,{approve,reason});setPhoto(null);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
  return <section className="rd-card rd-settings-body"><h2>Photo review queue</h2><p className="rd-caption">Compare the current main photo, selfie, and displayed code. Approve only a clear match. You cannot review your own submission.</p><button className="rd-btn" disabled={busy} onClick={()=>void refresh()}>Refresh review queue</button>{!requests.length?<p>No pending requests.</p>:null}{requests.map(r=><article className="rd-review-request" key={r.userId}><strong>{r.displayName}</strong><span>Code: {r.verification.challenge}</span><button className="rd-btn" disabled={busy} onClick={()=>void show(r)}>Review photos</button>{photo?.id===r.userId?<><div className="rd-review-photos"><img src={photo.main} alt="Current main profile photo"/><img src={photo.proof} alt="Private verification selfie"/></div><label className="rd-field"><span>Reason if rejecting</span><input className="rd-input" value={reason} maxLength={180} onChange={e=>setReason(e.target.value)}/></label><div className="rd-row"><button className="rd-btn primary" disabled={busy||r.userId===props.session.userId} onClick={()=>void review(r,true)}>Approve photo match</button><button className="rd-btn" disabled={busy||r.userId===props.session.userId} onClick={()=>void review(r,false)}>Reject request</button></div></>:null}</article>)}{error?<p role="alert" className="rd-error">{error}</p>:null}</section>;
}
export function ReportMemberButton({api,session,peerKey}:Props&{peerKey:string}){
  const [open,setOpen]=useState(false),[reason,setReason]=useState("Harassment or unwanted contact"),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  return <><button className="rd-btn" onClick={()=>setOpen(true)}>Report profile</button>{open?<div className="rd-report-inline" role="group" aria-label="Report profile"><label className="rd-field"><span>Reason</span><select className="rd-input" value={reason} onChange={e=>setReason(e.target.value)}>{["Harassment or unwanted contact","Impersonation or misleading photos","Spam or scam",UNDERAGE_REPORT_REASON,EXPLOITATION_REPORT_REASON,"Other safety concern"].map(r=><option key={r}>{r}</option>)}</select></label><div className="rd-row"><button className="rd-btn primary" disabled={busy} onClick={()=>{setBusy(true);void api.reportUser(session.sessionToken,peerKey,reason).then(()=>{setMessage("Report sent for review. You can also block this member.");setOpen(false);}).catch(e=>setMessage(e.message)).finally(()=>setBusy(false));}}>Send report</button><button className="rd-btn" onClick={()=>setOpen(false)}>Cancel</button></div></div>:null}{message?<p role="status" className="rd-caption">{message}</p>:null}</>;
}
export function ReportProfileMediaButton({ api, session, mediaId, video, reportPath, context, labelOverride }: Props & { mediaId: string; video: boolean; reportPath?: string; context?: Record<string, string>; labelOverride?: string }) {
  const reasons = ["Sexual or explicit content", UNDERAGE_REPORT_REASON, EXPLOITATION_REPORT_REASON, "Harassment or abuse", "Other safety concern"];
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(reasons[0]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const label = labelOverride ?? (video ? "Report this video" : "Report this photo");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api.memberRequest(session.sessionToken, reportPath ?? `/media-review/published/${encodeURIComponent(mediaId)}/report`, { ...context, mediaId, reason });
      setSent(true);
      setOpen(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return <div>
    {!open && !sent && <button className="rd-btn" type="button" onClick={() => setOpen(true)}>{label}</button>}
    {open && <form className="rd-report-inline" aria-label={label} onSubmit={event => { event.preventDefault(); void submit(); }}>
      <label className="rd-field"><span>Reason</span><select className="rd-input" value={reason} onChange={event => setReason(event.target.value)}>
        {reasons.map(option => <option key={option}>{option}</option>)}
      </select></label>
      <div className="rd-row">
        <button className="rd-btn primary" type="submit" disabled={busy}>Send report</button>
        <button className="rd-btn" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>}
    {sent && <p role="status">Report sent for review.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

function ReportedProfileMedia({ api, session, reportId, mediaId }: Props & { reportId: string; mediaId: string }) {
  const [preview, setPreview] = useState<{ url: string; video: boolean }>();
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); }
    catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  }

  return <div>
    <button type="button" className="rd-btn" disabled={busy} onClick={() => void perform(async () => {
      const file = await api.memberPhoto(session.sessionToken, reportId, "reported-media");
      setPreview({ url: URL.createObjectURL(file), video: file.type.startsWith("video/") });
    })}>View reported media</button>
    {preview && <div>
      {preview.video ? <video controls src={preview.url} style={{ maxWidth: "100%" }} /> :
        <img src={preview.url} alt="Reported profile media" style={{ maxWidth: "100%", maxHeight: 420 }} />}
      {!removed && <form onSubmit={event => { event.preventDefault(); void perform(async () => {
        await api.memberRequest(session.sessionToken, `/admin/media-review/${encodeURIComponent(mediaId)}/decision`, { action: "removed", reason });
        setRemoved(true);
      }); }}>
        <label className="rd-field"><span>Removal reason</span><input className="rd-input" value={reason} maxLength={500} onChange={event => setReason(event.target.value)} /></label>
        <button type="submit" className="rd-btn" disabled={busy || !reason.trim()}>Remove reported media</button>
      </form>}
    </div>}
    {removed && <p role="status">Reported media removed.</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function SafetyReportQueue(props:Props){
  type Report={reportId:string;reason:string;createdAtMs:number;childSafetyPriority?: "underage" | "exploitation";target:{kind:string;targetKey?:string;messageId?:string;postingId?:string;conversationId?:string;broadcastId?:string;mediaId?:string;text?:string}};
  const [reports,setReports]=useState<Report[]>([]),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [childQueue, setChildQueue] = useState(false);
  const [canReviewChildSafety, setCanReviewChildSafety] = useState(false);
  async function refresh(priority = childQueue) {
    setError("");
    try {
      const result = await props.api.memberRequest<{ reports: Report[]; canReviewChildSafety?: boolean }>(
        props.session.sessionToken, priority ? "/admin/safety-reports?queue=child-safety" : "/admin/safety-reports");
      setReports(result.reports);
      setCanReviewChildSafety(Boolean(result.canReviewChildSafety));
      setChildQueue(priority);
    } catch (error) { setError((error as Error).message); }
  }
  useEffect(()=>{if(props.session.role==="admin")void refresh();},[props.api,props.session.sessionToken]);if(props.session.role!=="admin")return null;
  return <section className="rd-card rd-settings-body"><h2>Safety reports</h2><p className="rd-caption">Latest 200 reports. Review the evidence before taking action. Community plans can be canceled from Community.</p><button className="rd-btn" onClick={()=>void refresh()}>Refresh safety reports</button>{canReviewChildSafety && <button type="button" className="rd-btn" onClick={() => void refresh(!childQueue)}>
    {childQueue ? "General reports" : "Child safety reports"}</button>}{!reports.length?<p>No reports.</p>:null}{reports.map(r=><article className="rd-review-request" key={r.reportId}><strong>{r.target.mediaId ? (r.target.kind === "profile-media" ? "Profile media report" : `${r.target.kind.replace("-", " ")} report`) : r.target.kind === "broadcast" ? "Live broadcast report" : r.target.kind === "group-dm-message" ? "Group conversation report" : r.target.kind === "group-message" ? "Group discussion report" : r.target.kind === "message" ? "Message report" : "Member or plan report"}</strong><p>{r.reason}</p>{r.childSafetyPriority && r.target.text && r.target.kind === "message" && <blockquote>{r.target.text}</blockquote>}{r.target.mediaId && <><small>Media reference {r.target.mediaId}</small><ReportedProfileMedia api={props.api} session={props.session} reportId={r.reportId} mediaId={r.target.mediaId} /></>}{r.target.kind === "group-message" || r.target.kind === "group-dm-message" ? <><blockquote>{r.target.text}</blockquote><small>{r.target.postingId ?? r.target.conversationId}</small></> : null}<small>{new Date(r.createdAtMs).toLocaleString()}</small>{r.target.targetKey?.startsWith("user:")?<button className="rd-btn" disabled={r.target.targetKey===`user:${props.session.userId}`} onClick={()=>void props.api.adminBanUser(props.session.sessionToken,r.target.targetKey!.slice(5),`Safety review: ${r.reason}`).then(()=>setMessage("Member banned. Existing moderation controls can reverse this action.")).catch(e=>setError(e.message))}>Ban reported member</button>:null}{r.target.broadcastId ? <small>Broadcast {r.target.broadcastId}</small> : null}<small>Reference: {r.reportId}</small></article>)}{error?<p role="alert" className="rd-error">{error}</p>:null}{message?<p role="status">{message}</p>:null}</section>;
}
export function PrivacyBlockList(props:Props){const [blocked,setBlocked]=useState<string[]>([]),[error,setError]=useState("");async function refresh(){try{setBlocked([...(await props.api.listBlocked(props.session.sessionToken)).blocked]);}catch(e){setError((e as Error).message);}}useEffect(()=>{void refresh();},[props.api,props.session.sessionToken]);return <section className="rd-card rd-settings-body"><h2>Blocked members</h2><p className="rd-caption">Blocking stops messages and map interactions in both directions. This control is free for members and guests.</p>{!blocked.length?<p>No blocked members.</p>:blocked.map((key,index)=><div className="rd-row" key={key}><span>{key.startsWith("session:") || key.startsWith("guest:")?"Anon":`Blocked member ${index+1}`}</span><button className="rd-btn" onClick={()=>void props.api.unblock(props.session.sessionToken,key).then(()=>{window.dispatchEvent(new Event("rd:member-updated"));void refresh();}).catch(e=>setError(e.message))}>Unblock</button></div>)}{error?<p role="alert">{error}</p>:null}</section>;}
