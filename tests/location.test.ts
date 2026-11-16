import { permittedLocation } from "../frontend/src/app/location";
import { createPostgresPool } from "../backend/src/repositories/postgresCore";
describe("Location consent and database transport",()=>{
  it("Given denied or missing geolocation When discovery loads Then never fabricates a default presence coordinate",async()=>{
    const denied={getCurrentPosition:(_ok:unknown,fail:()=>void)=>fail()} as unknown as Geolocation;
    expect(await permittedLocation(denied)).toBeNull();
    const allowed={getCurrentPosition:(ok:(p:unknown)=>void)=>ok({coords:{latitude:49,longitude:-123}})} as unknown as Geolocation;
    expect(await permittedLocation(allowed)).toEqual({lat:49,lng:-123});
  });
  it("Given PostgreSQL TLS When configuring transport Then validates server certificates",async()=>{
    const pool=createPostgresPool({connectionString:'postgres://fixture@localhost/fixture',ssl:true,sourceEnvKey:'DATABASE_URL'});
    expect((pool as unknown as {options:{ssl:unknown}}).options.ssl).toEqual({rejectUnauthorized:true});await pool.end();
  });
});
