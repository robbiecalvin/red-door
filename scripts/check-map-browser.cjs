// Run npm run dev separately. This checks the real renderer with a controlled style,
// not the external tile service. Never use production accounts or data in this harness.
const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const path=require('node:path');
const origin=process.env.REDDOOR_BROWSER_ORIGIN||'http://127.0.0.1:5173';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('An isolated loopback Vite origin is required');
(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
    let requests=0,failStyle=false;
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/styles/dark',async route=>{requests++;if(failStyle)return route.abort();return route.fulfill({json:{version:8,sources:{},layers:[{id:'dark',type:'background',paint:{'background-color':'#141418'}}]}});});
    await page.route('**/__map_harness',route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><div id="root" style="width:100vw;height:100vh"></div></body></html>'}));
    await page.goto(origin+'/__map_harness');
    const root=path.resolve(__dirname,'..').replaceAll('\\','/');
    const start=Date.now();
    await page.addScriptTag({type:'module',content:`import React from '/@fs/${root}/node_modules/.vite/deps/react.js';import ReactDOM from '/@fs/${root}/node_modules/.vite/deps/react-dom_client.js';import{MapView}from'/src/features/map/MapView.tsx';const root=ReactDOM.createRoot(document.getElementById('root'));window.renderMap=(show=true)=>root.render(React.createElement(React.StrictMode,null,show?React.createElement(MapView,{initialView:{center:{lat:49.28,lng:-123.12},zoom:10},markers:[]}):null));window.renderMap();`});
    await page.locator('canvas').waitFor({timeout:15000});
    await page.waitForFunction(()=>!document.body.textContent.includes('Loading dark map'),{timeout:15000});
    assert.equal(await page.getByRole('status').count(),0);assert.equal(await page.locator('canvas').count(),1);
    const initialRenderMs=Date.now()-start;
    await page.context().setOffline(true);await page.getByText('You are offline.',{exact:false}).waitFor();
    await page.context().setOffline(false);await page.waitForFunction(()=>!document.body.textContent.includes('Loading dark map'));
    await page.setViewportSize({width:844,height:390});await page.evaluate(()=>window.dispatchEvent(new Event('orientationchange')));
    for(let n=0;n<5;n++){await page.evaluate(()=>window.renderMap(false));await page.waitForTimeout(30);await page.evaluate(()=>window.renderMap());await page.waitForTimeout(70);}
    await page.waitForFunction(()=>!document.body.textContent.includes('Loading dark map'));
    assert.equal(await page.locator('canvas').count(),1);
    failStyle=true;await page.evaluate(()=>window.renderMap(false));await page.waitForTimeout(50);await page.evaluate(()=>window.renderMap());
    await page.getByText('Map coverage is incomplete.',{exact:false}).waitFor();
    const before=requests;await page.waitForTimeout(15000);assert.ok(requests-before<=3,'automatic style retries must be bounded');assert.equal(await page.locator('canvas').count(),1);
    await page.getByText('Map coverage is incomplete.',{exact:false}).waitFor();
    failStyle=false;await page.getByRole('button',{name:'Retry map'}).click();await page.waitForFunction(()=>!document.body.textContent.includes('Loading dark map')&&!document.body.textContent.includes('Map coverage is incomplete.'));
    await page.evaluate(()=>{const canvas=document.querySelector('canvas');const gl=canvas.getContext('webgl2');const ext=gl?.getExtension('WEBGL_lose_context');if(!ext)throw Error('Context-loss extension unavailable');ext.loseContext();setTimeout(()=>ext.restoreContext(),200);});
    await page.waitForTimeout(1500);assert.equal(await page.locator('canvas').count(),1);
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({status:'PASS',initialRenderMs,styleRequests:requests,checks:['real renderer with fixture dark style','one canvas','StrictMode','offline/online','orientation','rapid navigation','blocked style and bounded retries','manual recovery','context loss/restoration'],externalBasemap:'NOT TESTED'}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
