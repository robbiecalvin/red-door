import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { Pool } from "pg";
import { ensurePostgresSchema } from "../../backend/src/repositories/postgresCore";
import { createPostgresAuthStateRepository } from "../../backend/src/repositories/postgresAuthStateRepository";
import { createAuthService } from "../../backend/src/services/authService";
// Actual PostgreSQL engine via WASM; this is not evidence of the hosted database or its disk.
async function run(){
  const db=new PGlite();
  const query=async(sql:string,values?:unknown[])=>db.query(sql,values);
  const pool={query,connect:async()=>({query,release(){}})} as unknown as Pool;
  try{
    await ensurePostgresSchema(pool);await ensurePostgresSchema(pool);
    let now=1800000000000;
    const make=(initialState?:Parameters<typeof createAuthService>[0]['initialState'])=>createAuthService({jwtSecret:'postgres-fixture-only',emailOnlyVerification:true,initialState:initialState??{users:[],sessions:[]},nowMs:()=>now,verificationCodeGenerator:()=>"123456",onVerificationCodeIssued:()=>{}});
    const repo=createPostgresAuthStateRepository(pool);let auth=make();auth.register('postgres@example.com','Strong-Test123!','');
    for(let n=0;n<5;n++)auth.verifyEmail('postgres@example.com','000000');
    await repo.saveState(auth.snapshotState());auth=make(await repo.loadState());
    const blocked=auth.verifyEmail("postgres@example.com","123456");assert.equal(blocked.ok,false);if(!blocked.ok)assert.equal(blocked.error.code,"RATE_LIMITED");
    const resend=auth.resendVerificationCode("postgres@example.com");assert.equal(resend.ok,false);if(!resend.ok)assert.equal(resend.error.code,"RATE_LIMITED");
    now+=900001;auth.resendVerificationCode('postgres@example.com');assert.equal(auth.verifyEmail("postgres@example.com","123456").ok,true);
    await repo.saveState(auth.snapshotState());const restored=await repo.loadState();
    assert.equal(restored.users[0].emailOwnershipVerifiedAtMs,now);assert.equal(restored.users[0].verificationAttemptCount,0);assert.equal(restored.users[0].emailVerified,true);
    assert.equal(make(restored).login("postgres@example.com","Strong-Test123!").ok,true);console.log("PASS: PostgreSQL migration repeatability, lockout persistence, ownership evidence, session reload");
  }finally{await db.close();}
}
void run().catch(e=>{console.error(e);process.exitCode=1;});
