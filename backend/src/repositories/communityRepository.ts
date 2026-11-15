import fs from "node:fs";
import path from "node:path";
import type { Pool } from "pg";
import type { CommunityPlan } from "../../../shared/member";
export async function createCommunityRepository(pool: Pool | null, filePath=path.resolve(process.cwd(),"backend/.data/community.json")) {
  type State = { plans: CommunityPlan[]; settings: Record<string,unknown>; reports?: import("../services/reportService").ReportRecord[]; blocks?: {blockerKey:string;blockedKey:string}[] };
  let state: State={plans:[],settings:{}};
  if(pool) {
    await pool.query("CREATE TABLE IF NOT EXISTS community_state (id TEXT PRIMARY KEY, data JSONB NOT NULL)");
    await pool.query("INSERT INTO community_state (id,data) VALUES ('main',$1::jsonb) ON CONFLICT DO NOTHING",[JSON.stringify(state)]);
  } else if(fs.existsSync(filePath)) state=JSON.parse(fs.readFileSync(filePath,"utf8"));
  let queue: Promise<unknown>=Promise.resolve();
  function update<T>(change:(state:State)=>T): Promise<T> {
    const job=queue.then(async()=>{
      if(pool) {
        const client=await pool.connect();
        try {await client.query("BEGIN");const row=await client.query("SELECT data FROM community_state WHERE id='main' FOR UPDATE");const next=row.rows[0].data as State;const result=change(next);await client.query("UPDATE community_state SET data=$1::jsonb WHERE id='main'",[JSON.stringify(next)]);await client.query("COMMIT");return result;}
        catch(e){await client.query("ROLLBACK");throw e;}finally{client.release();}
      }
      const next=JSON.parse(JSON.stringify(state)) as State, result=change(next);
      fs.mkdirSync(path.dirname(filePath),{recursive:true});fs.writeFileSync(filePath+".tmp",JSON.stringify(next),{mode:0o600});fs.renameSync(filePath+".tmp",filePath);state=next;return result;
    });queue=job.catch(()=>{});return job;
  }
  return { update, async readSetting<T>(key:string):Promise<T|undefined>{await queue;const data=pool?(await pool.query("SELECT data FROM community_state WHERE id='main'")).rows[0].data as State:state;return data.settings[key]===undefined?undefined:JSON.parse(JSON.stringify(data.settings[key])) as T;}, async safety(){await queue;const data=pool?(await pool.query("SELECT data FROM community_state WHERE id='main'")).rows[0].data as State:state;return {reports:data.reports ?? [],blocks:data.blocks ?? []};}, async plans() {await queue;if(pool){const r=await pool.query("SELECT data FROM community_state WHERE id='main'");return (r.rows[0].data as State).plans;}return JSON.parse(JSON.stringify(state.plans)) as CommunityPlan[];}, async setting<T>(key:string,create:()=>T):Promise<T> {return update(s=>{if(s.settings[key]===undefined)s.settings[key]=create();return s.settings[key] as T;});} };
}
export type CommunityRepository = Awaited<ReturnType<typeof createCommunityRepository>>;
