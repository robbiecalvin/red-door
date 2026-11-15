import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAuthService } from "../backend/src/services/authService";
function fixture() { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "reddoor-recovery-")); let now = 1800000000000; const file = path.join(dir,"users.json"); const service = createAuthService({ jwtSecret:"test", skipEmailVerification:true, userStoreFilePath:file, nowMs:()=>now }); service.register("member@example.com","Original-Test123!",""); return { service, file, dir, advance:(ms:number)=>{now+=ms;} }; }
// Acceptance: single-use, expiring recovery; no raw token persistence; session revocation;
// claiming a configured admin email is insufficient to obtain admin privileges.
describe("Account recovery",()=>{
  it("Given a reset request When used successfully Then invalidates old credentials, tokens, and all sessions",()=>{
    const f=fixture();const login=f.service.login("member@example.com","Original-Test123!");if(!login.ok)throw Error("login failed");
    const reset=f.service.requestPasswordReset("member@example.com");if(!reset)throw Error("reset failed");
    expect(fs.readFileSync(f.file,"utf8")).not.toContain(reset.token);
    expect(f.service.resetPassword(reset.token,"New-Secure123!").ok).toBe(true);
    expect(f.service.getSession(login.value.session.sessionToken).ok).toBe(false);
    expect(f.service.login("member@example.com","Original-Test123!").ok).toBe(false);
    expect(f.service.login("member@example.com","New-Secure123!").ok).toBe(true);
    expect(f.service.resetPassword(reset.token,"Another-Secure123!").ok).toBe(false);fs.rmSync(f.dir,{recursive:true});
  });
  it("Given invalid, expired, or replaced links When presented Then rejects them without changing the password",()=>{
    const f=fixture();expect(f.service.requestPasswordReset("unknown@example.com")).toBeNull();expect(f.service.requestPasswordReset(null)).toBeNull();
    const reset=f.service.requestPasswordReset("member@example.com")!;expect(f.service.requestPasswordReset("member@example.com")).toBeNull();
    expect(f.service.resetPassword("bad","New-Secure123!").ok).toBe(false);expect(f.service.resetPassword(reset.token,"weak").ok).toBe(false);
    f.advance(60001);const next=f.service.requestPasswordReset("member@example.com")!;expect(f.service.resetPassword(reset.token,"New-Secure123!").ok).toBe(false);
    f.advance(900000);expect(f.service.resetPassword(next.token,"New-Secure123!").ok).toBe(false);expect(f.service.login("member@example.com","Original-Test123!").ok).toBe(true);fs.rmSync(f.dir,{recursive:true});
  });
  it("Given a persisted reset When the server restarts Then the valid link still works but banned accounts cannot recover",()=>{
    const f=fixture(),reset=f.service.requestPasswordReset("member@example.com")!;
    const restored=createAuthService({jwtSecret:"test",skipEmailVerification:true,userStoreFilePath:f.file,nowMs:()=>1800000000000});
    expect(restored.resetPassword(reset.token,"New-Secure123!").ok).toBe(true);
    const user=restored.listUsers()[0];restored.banUser(user.id,"Safety review");expect(restored.requestPasswordReset("member@example.com")).toBeNull();fs.rmSync(f.dir,{recursive:true});
  });
  it("Given a configured administrator email When claimed in web signup Then requires an email code before granting admin",()=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"reddoor-admin-"));let channel="",destination="";
    const service=createAuthService({jwtSecret:"test",skipEmailVerification:true,userStoreFilePath:path.join(dir,"users.json"),adminEmails:["admin@example.com"],verificationCodeGenerator:()=>"123456",onVerificationCodeIssued:(to,_code,ch)=>{channel=ch;destination=to;}});
    expect(service.register("admin@example.com","Secure-Test123!","+15555551234").ok).toBe(true);expect(channel).toBe("email");expect(destination).toBe("admin@example.com");
    expect(service.login("admin@example.com","Secure-Test123!").ok).toBe(false);expect(service.listUsers()[0].role).toBe("user");
    const verified=service.verifyEmail("admin@example.com","123456");if(!verified.ok)throw Error(verified.error.message);expect(verified.value.session.role).toBe("admin");fs.rmSync(dir,{recursive:true});
  });
});

describe("Verification-code guessing protection", () => {
  it("Given five wrong codes When a new code is resent Then the account remains rate limited until the verification window resets", () => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),"reddoor-code-limit-"));let now=1800000000000;
    const service=createAuthService({jwtSecret:"test",userStoreFilePath:path.join(dir,"users.json"),adminEmails:["admin@example.com"],verificationCodeGenerator:()=>"123456",nowMs:()=>now,onVerificationCodeIssued:()=>{}});
    service.register("admin@example.com","Secure-Test123!","+15555551234");
    for(let n=0;n<5;n++) expect(service.verifyEmail("admin@example.com","000000").ok).toBe(false);
    service.resendVerificationCode("admin@example.com");
    const blocked=service.verifyEmail("admin@example.com","123456");if(blocked.ok)throw Error("Expected rate limit");expect(blocked.error.code).toBe("RATE_LIMITED");
    now+=900001;service.resendVerificationCode("admin@example.com");expect(service.verifyEmail("admin@example.com","123456").ok).toBe(true);fs.rmSync(dir,{recursive:true});
  });
});
