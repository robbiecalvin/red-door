const {chromium}=require('playwright-core');
const assert=require('node:assert/strict');
const origin=process.env.REDDOOR_BROWSER_ORIGIN||'http://127.0.0.1:5173';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw Error('Use an isolated loopback dev server and test data only');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},permissions:[]});const page=await context.newPage();
  const errors=[];let presenceWrites=0,mdRequests=0;page.on('pageerror',e=>errors.push(e.message));
  page.on('request',request=>{const u=new URL(request.url());if(u.pathname.includes('/presence/')&&request.method()==='POST')presenceWrites++;if(/^\/(api\/)?(md|integrations\/md)(\/|$)/.test(u.pathname))mdRequests++;});
  await page.addInitScript(()=>{navigator.geolocation.getCurrentPosition=(_ok,fail)=>fail?.({code:1,message:'Permission denied',PERMISSION_DENIED:1});});
  await page.goto(origin);const start=Date.now();await page.getByRole('button',{name:'Create guest session'}).click();await page.getByLabel('Age in years').waitFor();const guestEntryMs=Date.now()-start;
  await page.getByLabel('Age in years').fill('17');await page.getByRole('button',{name:'Confirm age'}).click();await page.getByRole('alert').filter({hasText:'18 or older'}).waitFor();
  await page.getByLabel('Age in years').fill('25');await page.getByRole('button',{name:'Confirm age'}).click();await page.getByRole('button',{name:'Map',exact:true}).waitFor();await page.waitForTimeout(600);
  assert.equal(presenceWrites,0,'denying GPS must not publish the default camera');assert.equal(await page.getByLabel('MD companions').count(),0);assert.equal(await page.getByLabel('Open MD',{exact:true}).count(),0);
  await page.goto(origin+'/#/md');await page.waitForTimeout(500);assert.equal(mdRequests,0,'deep links cannot initiate MD requests');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({status:'PASS',guestEntryMs,presenceWrites,mdRequests,checks:['mobile viewport guest entry','underage rejection','adult self-declaration','GPS denial','standalone navigation and deep-link isolation','no uncaught errors'],physicalDevice:false}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
