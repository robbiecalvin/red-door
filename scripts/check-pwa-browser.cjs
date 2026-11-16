// Tests the production build at a GitHub-Pages-style subpath, with controlled data only.
const {chromium}=require('playwright-core');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../dist');
const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
let variant='a',privateHits=0;
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(!url.pathname.startsWith('/red-door/')){res.writeHead(404).end();return;}
 const relative=decodeURIComponent(url.pathname.slice('/red-door/'.length))||'index.html';
 if(relative.startsWith('api/')||relative.startsWith('media/')){privateHits++;res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({private:'controlled-private-sentinel'}));return;}
 const file=path.resolve(root,relative);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404).end();return;}
 let body=fs.readFileSync(file);if(relative==='sw.js' && variant==='b')body=Buffer.from(body.toString().replace("const VERSION = '","const VERSION = 'browser-update-b-"));
 res.writeHead(200,{'content-type':mime[path.extname(file)]||'application/octet-stream','cache-control':'no-cache'});res.end(body);
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,base=origin+'/red-door/';
 const profile=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'reddoor-pwa-browser-'));
 const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox'],viewport:{width:390,height:844}});
 const browser=context.browser();
 try{
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  // No external services are contacted by this test.
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(base);await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller));
  assert.equal(await page.getByText('A Red Door update is ready.',{exact:false}).count(),0,'first installation must not offer a false update');
  const installability=await(await context.newCDPSession(page)).send('Page.getInstallabilityErrors');assert.deepEqual(installability.installabilityErrors,[]);
  const manifest=await page.evaluate(async()=>{const result=await fetch('./manifest.webmanifest');return result.json();});
  assert.equal(manifest.display,'standalone');assert.equal(manifest.start_url,'./');assert.equal(manifest.scope,'./');assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
  const icon=await page.evaluate(async()=>{const bitmap=await createImageBitmap(await(await fetch('./icons/icon-512.png')).blob());return [bitmap.width,bitmap.height];});assert.deepEqual(icon,[512,512]);
  await page.evaluate(async()=>{await fetch('./api/private',{headers:{'x-session-token':'fixture-only'}});await fetch('./media/private-photo');await fetch('./?st=fixture-only');await fetch('./api/private',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});});
  assert.equal(privateHits,3);
  let keys=await page.evaluate(async()=>{const names=await caches.keys();return (await Promise.all(names.map(async name=>(await(await caches.open(name)).keys()).map(r=>r.url)))).flat();});
  assert.ok(keys.length>5);assert.ok(!keys.some(key=>/api\/|media\/|st=|index\.html/.test(key)));
  await page.getByRole('button',{name:'Install Red Door',exact:true}).click();await page.getByRole('dialog',{name:'Install Red Door'}).waitFor();await page.getByRole('button',{name:'Close Install Red Door'}).click();
  await page.evaluate(()=>{const event=new Event('beforeinstallprompt');event.prompt=async()=>{window.fixturePromptCalled=true;};event.userChoice=Promise.resolve({outcome:'dismissed'});window.dispatchEvent(event);});
  await page.getByRole('button',{name:'Install Red Door',exact:true}).click();await page.getByRole('button',{name:'Install app',exact:true}).click();assert.equal(await page.evaluate(()=>window.fixturePromptCalled),true);await page.getByRole('button',{name:'Close Install Red Door'}).click();
  await context.setOffline(true);await page.getByText('You’re offline.',{exact:false}).waitFor();
  assert.equal(await page.evaluate(async()=>{try{await fetch('./api/private');return false;}catch{return true;}}),true,'private API cannot be served from cache offline');
  await page.goto(base);await page.getByRole('heading',{name:'Let’s reconnect.'}).waitFor();assert.equal(await page.getByRole('button',{name:'Try again'}).count(),1);
  await context.setOffline(false);await page.getByRole('button',{name:'Try again'}).click();await page.getByRole('button',{name:'Create guest session'}).waitFor();
  // A waiting update must preserve an in-progress form until explicitly accepted.
  await page.getByRole('tab',{name:'Login',exact:true}).click();await page.getByLabel('Email',{exact:true}).fill('controlled-draft@example.com');
  variant='b';await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await page.getByRole('button',{name:'Reload app',exact:true}).waitFor({timeout:15000});assert.equal(await page.getByLabel('Email',{exact:true}).inputValue(),'controlled-draft@example.com');
  await page.getByRole('button',{name:'Reload app',exact:true}).click();await page.getByRole('button',{name:'Create guest session'}).waitFor();
  await page.waitForFunction(async()=>{const reg=await navigator.serviceWorker.getRegistration();return !reg.waiting;});
  keys=await page.evaluate(()=>caches.keys());assert.ok(keys.some(k=>k.includes('browser-update-b-')));
  assert.ok(keys.length<=2,'keep at most current and previous public builds for this scope');
  await page.evaluate(()=>window.dispatchEvent(new Event('appinstalled')));assert.equal(await page.getByRole('button',{name:'Install Red Door',exact:true}).count(),0);
  // iPhone install guidance is tested in Chromium with a simulated user agent, not an actual phone.
  const apple=await browser.newContext({userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await apple.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());const iphone=await apple.newPage();await iphone.goto(base);await iphone.getByRole('button',{name:'Install Red Door',exact:true}).click();await iphone.getByText('Add to Home Screen',{exact:true}).waitFor();await apple.close();
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({status:'PASS',checks:['Chromium installability','subpath manifest and icons','first install without false update','install prompt/dismissal','private request/cache isolation','offline launch and reconnect','waiting update preserves form','explicit update activation','installed UI','simulated iPhone instructions'],physicalPhones:'NOT TESTED'}));
 }finally{await context.close();fs.rmSync(profile,{recursive:true,force:true});await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
