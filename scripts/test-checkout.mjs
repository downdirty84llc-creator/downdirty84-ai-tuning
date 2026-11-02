// Local-only browser regressions. No Stripe account, payment or database is used.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.DD84_TEST_OUTPUT || await fs.mkdtemp(path.join(os.tmpdir(),'dd84-checkout-'));
await fs.mkdir(output,{recursive:true});
const server=http.createServer(async(req,res)=>{try{
  const name=new URL(req.url,'http://localhost').pathname;
  let file=path.resolve(root,'dist','.'+name);
  if(!file.startsWith(path.join(root,'dist')+path.sep)){res.writeHead(404).end();return;}
  try{if(!(await fs.stat(file)).isFile())throw Error();}catch{file=path.join(root,'dist/index.html');}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
  res.end(await fs.readFile(file));
}catch{res.writeHead(500).end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true,...(process.env.DD84_BROWSER_PATH?{executablePath:process.env.DD84_BROWSER_PATH}:{})});
let passed=0;const ok=message=>{passed++;console.log(`PASS ${message}`);};
const ready={enabled:true,code:'READY',message:'Online payments are available.'};
const disabled={enabled:false,code:'PAYMENTS_DISABLED',message:'Online payments are not configured on this deployment.'};
const base={pricesLive:false,services:[{service:'LOG_REVIEW',label:'Log Review',priceId:'synthetic-price',unitAmount:null,currency:'usd'}],addons:[]};
try{
  const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let catalog={...base,checkout:disabled},catalogFails=false,checkoutPosts=0,checkoutStatus=500;
  let holdCheckout=false,releaseCheckout;
  await page.route('**/api/v1/**',async route=>{
    const p=new URL(route.request().url()).pathname;
    if(p==='/api/v1/catalog')return route.fulfill({status:catalogFails?503:200,json:catalogFails?{message:'Synthetic catalog outage'}:catalog});
    if(p==='/api/v1/checkout'){
      checkoutPosts++;
      assert.equal(route.request().postDataJSON().service,'LOG_REVIEW');
      if(holdCheckout) await new Promise(resolve=>{releaseCheckout=resolve;});
      else await new Promise(r=>setTimeout(r,150));
      return route.fulfill({status:checkoutStatus,json:checkoutStatus===200
        ? {sessionId:'cs_synthetic',checkoutUrl:`${origin}/buy#hosted-synthetic`}
        : {error:'PAYMENTS_UNVERIFIED',message:'Synthetic checkout unavailable'}});
    }
    return route.fulfill({json:{brandName:'Down Dirty 84'}});
  });
  await page.goto(origin+'/buy');
  await page.getByRole('status').filter({hasText:disabled.message}).waitFor();
  await page.getByRole('button',{name:/^Log Review/}).click();
  assert(await page.getByRole('button',{name:'Online payments unavailable',exact:true}).isDisabled());
  assert.equal(await page.getByText(/Live prices are temporarily unavailable/).count(),0);
  assert.equal(checkoutPosts,0);
  assert(await page.getByRole('link',{name:'Downdirty84llc@gmail.com',exact:true}).isVisible());
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.screenshot({path:path.join(output,'payments-disabled-mobile.png'),fullPage:true});
  ok('disabled payments are disclosed before checkout, contact path works and mobile does not overflow');

  await page.getByPlaceholder('2008 Silverado 2500 6.0').fill('Synthetic retained vehicle');
  catalog={...base,checkout:ready};
  await page.getByRole('button',{name:'Check availability again',exact:true}).click();
  await page.getByRole('button',{name:'Continue to payment',exact:true}).waitFor();
  assert.equal(await page.getByPlaceholder('2008 Silverado 2500 6.0').inputValue(),'Synthetic retained vehicle');
  assert(await page.getByText(/Live prices are temporarily unavailable/).isVisible());
  ok('availability refresh recovers payment controls without discarding vehicle details');

  await page.getByRole('button',{name:'Continue to payment',exact:true}).dblclick();
  await page.getByRole('alert').filter({hasText:'Synthetic checkout unavailable'}).waitFor();
  assert.equal(checkoutPosts,1);
  assert(await page.getByRole('button',{name:'Continue to payment',exact:true}).isEnabled());
  ok('duplicate clicks submit only once and a failed checkout remains retryable');

  checkoutStatus=503;
  await page.getByRole('button',{name:'Continue to payment',exact:true}).click();
  await page.getByRole('button',{name:'Online payments unavailable',exact:true}).waitFor();
  assert.equal(checkoutPosts,2);
  assert(await page.getByRole('button',{name:'Online payments unavailable',exact:true}).isDisabled());
  assert.equal(await page.getByPlaceholder('2008 Silverado 2500 6.0').inputValue(),'Synthetic retained vehicle');
  ok('server-side payment withdrawal disables further attempts and preserves the form');

  catalogFails=true;
  await page.getByRole('button',{name:'Check availability again',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Synthetic catalog outage'}).waitFor();
  assert(await page.getByRole('button',{name:'Online payments unavailable',exact:true}).isDisabled());
  catalogFails=false;
  await page.getByRole('button',{name:'Check availability again',exact:true}).click();
  await page.getByRole('button',{name:'Continue to payment',exact:true}).waitFor();
  assert.equal(checkoutPosts,2);
  ok('failed availability refresh stays closed and a later successful refresh does not create a checkout');

  catalog={...base};
  await page.reload();
  await page.getByRole('status').filter({hasText:/availability could not be confirmed/}).waitFor();
  await page.getByRole('button',{name:/^Log Review/}).click();
  assert(await page.getByRole('button',{name:'Online payments unavailable',exact:true}).isDisabled());
  assert.equal(checkoutPosts,2);
  ok('older API response without payment metadata fails closed');

  catalogFails=true;
  await page.reload();
  await page.getByRole('status').filter({hasText:'Synthetic catalog outage'}).waitFor();
  catalogFails=false;catalog={...base,checkout:ready};
  await page.getByRole('button',{name:'Check availability again',exact:true}).click();
  await page.getByRole('button',{name:/^Log Review/}).waitFor();
  assert.equal(checkoutPosts,2);
  assert.deepEqual(errors,[]);
  ok('initial catalog failure has a working recovery control with no runtime errors');

  await page.getByRole('button',{name:/^Log Review/}).click();
  await page.getByPlaceholder('2008 Silverado 2500 6.0').fill('Synthetic Back restoration');
  checkoutStatus=200;
  await page.getByRole('button',{name:'Continue to payment',exact:true}).click();
  await page.waitForURL('**/buy#hosted-synthetic');
  assert.equal(checkoutPosts,3);
  assert(await page.getByRole('button',{name:'Opening Stripe…',exact:true}).isDisabled());
  // Retain the live React state and reproduce persisted pageshow explicitly:
  // Playwright's default browser flags disable the real back/forward cache.
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  await page.getByRole('button',{name:'Continue to payment',exact:true}).waitFor();
  assert(await page.getByRole('button',{name:'Continue to payment',exact:true}).isEnabled());
  assert.equal(await page.getByPlaceholder('2008 Silverado 2500 6.0').inputValue(),'Synthetic Back restoration');
  assert.equal(checkoutPosts,3);
  await page.goBack();
  await page.getByRole('button',{name:'Continue to payment',exact:true}).waitFor();
  assert.equal(checkoutPosts,3);
  await page.goto(origin+'/buy?checkout=cancelled');
  await page.getByRole('button',{name:/^Log Review/}).waitFor();
  assert.equal(checkoutPosts,3);
  assert.deepEqual(errors,[]);
  ok('successful hosted redirect, persisted Back restoration and cancel return do not leave checkout stuck or resubmit');

  await page.getByRole('button',{name:/^Log Review/}).click();
  holdCheckout=true;
  const request=page.waitForRequest(req=>new URL(req.url()).pathname==='/api/v1/checkout');
  await page.getByRole('button',{name:'Continue to payment',exact:true}).click();
  await request;
  await page.getByRole('link',{name:'Help',exact:true}).click();
  await page.getByRole('heading',{name:'Choose your next step.',exact:true}).waitFor();
  releaseCheckout();
  await page.waitForTimeout(300);
  assert.equal(new URL(page.url()).pathname,'/help');
  assert.equal(checkoutPosts,4);
  assert.deepEqual(errors,[]);
  ok('late checkout response cannot redirect away from a newer workspace');
  await fs.writeFile(path.join(output,'result.json'),JSON.stringify({passed,syntheticOnly:true,checkoutPosts,errors},null,2));
  console.log(JSON.stringify({passed,output}));
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
