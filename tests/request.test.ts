import { boundedFetch } from "../frontend/src/app/request";
describe("Bounded API requests",()=>{
  const nativeFetch=globalThis.fetch;
  afterEach(()=>{globalThis.fetch=nativeFetch;jest.useRealTimers();});
  it("Given a stalled request When its deadline expires Then surfaces a recoverable error without retrying a mutation",async()=>{
    jest.useFakeTimers();const stub=jest.fn((_input,init)=>new Promise<Response>((_resolve,reject)=>init.signal.addEventListener('abort',()=>reject(new Error('aborted')))));globalThis.fetch=stub as typeof fetch;
    const result=boundedFetch('https://example.com/send',{method:'POST'},100).catch(e=>e);
    await jest.advanceTimersByTimeAsync(101);expect((await result).code).toBe('REQUEST_TIMEOUT');expect(stub).toHaveBeenCalledTimes(1);
  });
  it("Given response headers but a stalled body When the deadline expires Then still terminates the request",async()=>{
    jest.useFakeTimers();globalThis.fetch=jest.fn(async(_input,init)=>({status:200,arrayBuffer:()=>new Promise((_r,reject)=>init!.signal!.addEventListener('abort',()=>reject(new Error('aborted'))))})) as unknown as typeof fetch;
    const result=boundedFetch('https://example.com/data',{},100).catch(e=>e);await jest.advanceTimersByTimeAsync(101);expect((await result).code).toBe('REQUEST_TIMEOUT');
  });
  it("Given a successful response When requested Then preserves data and HTTP error status",async()=>{
    globalThis.fetch=jest.fn(async()=>new Response(JSON.stringify({message:'denied'}),{status:403,headers:{'content-type':'application/json'}}));const response=await boundedFetch('https://example.com');expect(response.status).toBe(403);expect(await response.json()).toEqual({message:'denied'});
  });
});
