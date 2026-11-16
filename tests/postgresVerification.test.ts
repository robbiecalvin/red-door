import { spawnSync } from "node:child_process";
import path from "node:path";
it("Given PostgreSQL state When migration repeats and verification attempts reload Then preserves lockout, code and ownership evidence",()=>{
  const result=spawnSync(process.execPath,["--import",require.resolve("tsx"),path.join(__dirname,"fixtures/postgresVerification.ts")],{encoding:"utf8",timeout:30000});
  expect({status:result.status,error:result.stderr}).toEqual({status:0,error:""});
  expect(result.stdout).toContain("PASS: PostgreSQL migration repeatability");
},35000);
