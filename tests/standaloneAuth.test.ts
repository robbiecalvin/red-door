import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAuthService } from "../backend/src/services/authService";
import { LAUNCH_END_MS } from "../shared/plus";
// Acceptance: email ownership, persisted attempts/codes, self-declared age, legacy compatibility.
describe("Standalone account boundaries",()=>{
  let dir:string,now:number;const password='Strong-Test123!';
  beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'standalone-auth-'));now=1800000000000;});afterEach(()=>fs.rmSync(dir,{recursive:true,force:true}));
  function service(){return createAuthService({jwtSecret:'fixture-only',emailOnlyVerification:true,userStoreFilePath:path.join(dir,'users.json'),nowMs:()=>now,verificationCodeGenerator:()=>"123456",onVerificationCodeIssued:()=>{}});}
  it("Given a new ordinary account When signing in before email ownership proof Then denies access until the emailed code is verified",()=>{
    const auth=service();expect(auth.register('member@example.com',password,'').ok).toBe(true);expect(auth.listUsers()[0].emailVerified).toBe(false);expect(auth.login('member@example.com',password)).toMatchObject({ok:false,error:{code:'EMAIL_VERIFICATION_REQUIRED'}});
    const verified=auth.verifyEmail('member@example.com','123456');expect(verified.ok).toBe(true);expect(auth.getUser(auth.listUsers()[0].id)?.emailOwnershipVerifiedAtMs).toBe(now);
    expect(auth.verifyEmail('member@example.com','123456')).toMatchObject({ok:false,error:{code:'INVALID_VERIFICATION_CODE'}});
  });
  it("Given failed code guesses When restarting or resending Then preserves lockout and cooldown without invalidating the valid code",()=>{
    let auth=service();auth.register('member@example.com',password,'');
    for(let n=0;n<5;n++)auth.verifyEmail('member@example.com','000000');
    auth=service();expect(auth.resendVerificationCode('member@example.com')).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});
    expect(auth.verifyEmail('member@example.com','123456')).toMatchObject({ok:false,error:{code:'RATE_LIMITED'}});
    now+=900001;expect(auth.resendVerificationCode('member@example.com').ok).toBe(true);auth=service();expect(auth.verifyEmail('member@example.com','123456').ok).toBe(true);
  });
  it("Given guest entry When declaring missing, fractional or underage values Then rejects them and requires an adult integer declaration",()=>{
    const auth=service(),guest=auth.createGuestSession();if(!guest.ok)throw Error('guest failed');const token=guest.value.session.sessionToken;
    expect(guest.value.session.ageVerified).toBe(false);
    for(const age of [undefined,null,'18',17,18.5,121,NaN])expect(auth.verifyAge(token,age as number).ok).toBe(false);
    expect(auth.verifyAge(token,18).ok).toBe(true);
  });
  it("Given a legacy verified record without provenance When upgrading Then preserves access and leaves provenance unknown",()=>{
    const old=createAuthService({jwtSecret:'fixture-only',skipEmailVerification:true,userStoreFilePath:path.join(dir,'users.json')});old.register('legacy@example.com',password,'');
    const auth=service();expect(auth.login('legacy@example.com',password).ok).toBe(true);expect(auth.getUser(auth.listUsers()[0].id)?.emailOwnershipVerifiedAtMs).toBeUndefined();
  });
  it("Given the launch end When interpreted in Vancouver Then expires at midnight in the current Vancouver timezone rules",()=>{
    expect(new Date(LAUNCH_END_MS).toISOString()).toBe('2027-01-01T07:00:00.000Z');
    expect(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Vancouver',hour:'2-digit',hourCycle:'h23',day:'2-digit'}).format(LAUNCH_END_MS)).toContain('00');
  });
});
