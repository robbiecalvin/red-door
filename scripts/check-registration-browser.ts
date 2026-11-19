// Isolated browser + actual TLS SMTP fixture; not a hosted external-inbox test.
import { chromium } from "playwright-core";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import assert from "node:assert/strict";
import { createTlsMail } from "../tests/fixtures/tlsMail";
const repo=path.resolve(__dirname,"..");
async function port(){const s=net.createServer();s.listen(0,"127.0.0.1");await once(s,"listening");const p=(s.address() as net.AddressInfo).port;await new Promise<void>(r=>s.close(()=>r()));return p;}
async function ready(url:string,child:ChildProcess){for(let n=0;n<100;n++){if(child.exitCode!==null)throw Error('Fixture service exited');try{if((await fetch(url)).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Fixture service readiness timed out');}
async function main(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"reddoor-register-browser-"));const mail=await createTlsMail(root);
 let backend:ChildProcess|undefined,frontend:ChildProcess|undefined,browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
 try{
  const apiPort=await port(),uiPort=await port();
  backend=spawn(process.execPath,["--import",require.resolve("tsx"),path.join(repo,"backend/src/server.ts")],{cwd:root,stdio:'ignore',env:{...process.env,NODE_EXTRA_CA_CERTS:mail.ca,PORT:String(apiPort),JWT_SECRET:'browser-fixture-only',DATABASE_URL:'',NEON_DATABASE_URL:'',REQUIRE_DATABASE:'false',S3_BUCKET:'',SMTP_HOST:'127.0.0.1',SMTP_PORT:String(mail.port),SMTP_SECURE:'true',SMTP_USER:'fixture-user',SMTP_PASS:'fixture-pass',SMTP_FROM:'noreply@example.com',PUBLIC_APP_URL:'https://example.com/',STRIPE_SECRET_KEY:'',MD_SHARED_SECRET:'',REGISTRATION_POLICY_REQUIRED:'true',REGISTRATION_TERMS_URL:'https://example.com/terms/fixture-v2',REGISTRATION_TERMS_VERSION:'fixture-v2',REGISTRATION_PRIVACY_URL:'https://example.com/privacy/fixture-v1',REGISTRATION_PRIVACY_VERSION:'fixture-v1'}});
  await ready(`http://127.0.0.1:${apiPort}/health`,backend);
  const register = async (policyAcceptance?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${apiPort}/auth/register`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        email: "controlled-browser@example.com", password: "Browser-Fixture123!", age: 25, policyAcceptance
      }) });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "REGISTRATION_POLICY_REQUIRED");
  };
  await register();
  await register({ accepted: true, termsVersion: "stale-version", privacyVersion: "fixture-v1" });
  assert.equal(mail.messages.length, 0);

  frontend=spawn(process.execPath,[path.join(repo,'vite.dev.mjs')],{cwd:repo,stdio:'ignore',env:{...process.env,DUALMODE_API_BASE_PATH:'/api',DUALMODE_WS_URL:'__disabled__',DUALMODE_BACKEND_PORT:String(apiPort),DUALMODE_FRONTEND_PORT:String(uiPort)}});
  await ready(`http://127.0.0.1:${uiPort}`,frontend);
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${uiPort}`);
  await page.getByRole('tab',{name:'Register',exact:true}).click();
  await page.getByLabel('Email',{exact:true}).fill('controlled-browser@example.com');await page.getByLabel('Password',{exact:true}).fill('Browser-Fixture123!');await page.getByLabel('Display name',{exact:true}).fill('Controlled Browser');await page.getByLabel('Age',{exact:true}).fill('25');
  await page.getByRole('tab',{name:'Login',exact:true}).click();
  assert.equal(await page.getByLabel('Email',{exact:true}).inputValue(), '');
  assert.equal(await page.getByLabel('Password',{exact:true}).inputValue(), '');
  await page.getByRole('tab',{name:'Register',exact:true}).click();
  assert.equal(await page.getByLabel('Email',{exact:true}).inputValue(), 'controlled-browser@example.com');
  const accept = page.getByRole("checkbox", { name: /I accept the Terms of Service and Privacy Policy/ });
  await accept.waitFor();
  assert.equal(await accept.isChecked(), false);
  assert.equal(await page.getByRole("button", { name: "Register", exact: true }).isEnabled(), false);
  assert.equal(await page.getByRole("link", { name: "Terms of Service" }).getAttribute("href"), "https://example.com/terms/fixture-v2");
  assert.equal(await page.getByRole("link", { name: "Privacy Policy" }).getAttribute("href"), "https://example.com/privacy/fixture-v1");
  await accept.check();
  assert.equal(await page.getByRole("checkbox", { name: /optional Badehaus X news/ }).isChecked(), false);
  await page.getByRole('button',{name:'Register',exact:true}).click();await page.getByLabel('Verification code',{exact:true}).waitFor();
  const verificationEmail = page.getByLabel('Verification email', {exact:true});
  await verificationEmail.fill('');
  assert.ok(await verificationEmail.isVisible());
  await verificationEmail.fill('controlled-browser@example.com');
  const message=await mail.next(0),code=/verification code is (\d{6})/.exec(message)?.[1];assert.ok(code);
  await page.getByLabel('Verification code',{exact:true}).fill(code==='000000'?'111111':'000000');await page.getByRole('button',{name:'Verify email',exact:true}).click();await page.getByRole('alert').filter({hasText:'Invalid or expired'}).waitFor();
  await page.getByLabel('Verification code',{exact:true}).fill(code!);
  const result=page.waitForResponse(r=>r.url().endsWith('/api/auth/verify-email')&&r.status()===200);
  await page.getByRole('button',{name:'Verify email',exact:true}).click();const verified=await(await result).json();assert.equal(verified.user.userType,'registered');
  await page.waitForFunction(()=>!document.querySelector('input[aria-label="Verification code"]'));
  await page.getByLabel("Profile race", { exact: true }).selectOption("Mixed / Multiracial");
  await page.getByLabel("Height in feet").selectOption("5");
  await page.getByLabel("Additional inches").selectOption("11");
  const saved = page.waitForResponse(response => response.url().endsWith("/api/profile/me") &&
    response.request().method() === "PUT" && response.ok());
  await page.getByRole("button", { name: "Save profile and continue" }).click();
  const profile = (await (await saved).json()).profile;
  assert.equal(profile.stats.race, "Mixed / Multiracial");
  assert.equal(profile.stats.heightInches, 71);

  const store = JSON.parse(fs.readFileSync(path.join(root, "backend/.data/auth-users.json"), "utf8"));
  const recorded = store.users.find((row: { email: string }) => row.email === "controlled-browser@example.com").plusData.registrationPolicy;
  assert.equal(recorded.termsVersion, "fixture-v2");
  assert.equal(recorded.privacyVersion, "fixture-v1");
  assert.equal(recorded.source, "registration");
  assert.equal(recorded.accepted, true);
  assert.ok(Number.isSafeInteger(recorded.acceptedAtMs));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',checks:['mobile registration UX','optional race and feet/inches profile entry','missing or stale policy acceptance rejected','versioned acceptance persisted','registration and login field isolation','strong password and adult declaration','verification required before login','actual TLS SMTP fixture','wrong code error','correct code and authenticated UI'],externalInbox:'NOT TESTED'}));
 }finally{
  await browser?.close();for(const child of [frontend,backend])if(child&&child.exitCode===null){child.kill('SIGTERM');await once(child,'exit');}
  await mail.close();fs.rmSync(root,{recursive:true,force:true});
 }
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;});
