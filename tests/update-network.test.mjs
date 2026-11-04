import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {createUpdateFetch,proxyEnvironment} from '../update-network.mjs';
const emptySystem=async()=>({});
test('environment proxy takes priority and manual Windows proxy is detected without global changes',async()=>{
  assert.equal((await proxyEnvironment('https://github.com',{env:{HTTPS_PROXY:'http://127.0.0.1:8123'},systemProxy:async()=>{throw Error('unnecessary')}})).HTTPS_PROXY,'http://127.0.0.1:8123/');
  const systemProxy=async()=>({enabled:1,server:'http=localhost:81;https=localhost:82',bypass:'localhost;*.local'});
  const proxy=await proxyEnvironment('https://github.com',{env:{},systemProxy});assert.equal(proxy.HTTPS_PROXY,'http://localhost:82/');assert.equal(proxy.NO_PROXY,'localhost,*.local');
  assert.equal(await proxyEnvironment('https://github.com',{env:{},systemProxy:async()=>({enabled:0,server:'localhost:82'})}),null);
});
test('a configured proxy is tried first and success never probes direct access',async()=>{
  const routes=[];const fetch=createUpdateFetch({env:{HTTPS_PROXY:'http://localhost:81'},systemProxy:emptySystem,requestImpl:async(_url,_options,proxy)=>{routes.push(!!proxy);return new Response('ok')}});
  assert.equal(await (await fetch('https://github.com')).text(),'ok');assert.deepEqual(routes,[true]);
});
test('failed proxy falls back to direct and no configured proxy uses direct only',async()=>{
  for(const configured of [true,false]){
    const routes=[];const fetch=createUpdateFetch({env:configured?{HTTPS_PROXY:'http://localhost:81'}:{},systemProxy:emptySystem,requestImpl:async(_url,_options,proxy)=>{routes.push(!!proxy);if(proxy)throw Error('offline');return new Response('direct')}});
    assert.equal(await (await fetch('https://github.com')).text(),'direct');assert.deepEqual(routes,configured?[true,false]:[false]);
  }
});
test('cancelled checks never start a fallback connection',async()=>{
  const stop=new AbortController(),routes=[];const fetch=createUpdateFetch({env:{HTTPS_PROXY:'http://localhost:81'},systemProxy:emptySystem,requestImpl:async(_url,_options,proxy)=>{routes.push(!!proxy);stop.abort();throw Error('cancelled')}});
  await assert.rejects(fetch('https://github.com',{signal:stop.signal}),{name:'AbortError'});assert.deepEqual(routes,[true]);
});
test('real transport uses a proxy, falls back after rejection, bounds bytes and preserves manual redirects',async()=>{
  let proxyHits=0,directHits=0,rejectProxy=false;
  const origin=http.createServer((req,res)=>{directHits++;if(req.url==='/redirect'){res.writeHead(302,{Location:'/ok'});res.end();}else res.end(req.url==='/large'?'too large':'direct');});
  const proxy=http.createServer((req,res)=>{proxyHits++;if(rejectProxy){res.writeHead(502);res.end();}else res.end('proxy');});
  origin.listen(0,'127.0.0.1');proxy.listen(0,'127.0.0.1');await Promise.all([once(origin,'listening'),once(proxy,'listening')]);
  const base='http://127.0.0.1:'+origin.address().port;
  try{
    const fetch=createUpdateFetch({env:{HTTP_PROXY:'http://127.0.0.1:'+proxy.address().port},systemProxy:emptySystem});
    assert.equal(await (await fetch(base+'/ok')).text(),'proxy');assert.equal(proxyHits,1);assert.equal(directHits,0);
    rejectProxy=true;assert.equal(await (await fetch(base+'/ok')).text(),'direct');assert.equal(directHits,1);
    const direct=createUpdateFetch({env:{},systemProxy:emptySystem});
    await assert.rejects(direct(base+'/large',{maxBytes:2}),/large/);
    const redirect=await direct(base+'/redirect',{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),'/ok');
    await assert.rejects(direct(base+'/redirect',{redirect:'error'}),/redirect/);
    await assert.rejects(direct(base+'/ok',{signal:AbortSignal.abort()}),{name:'AbortError'});
  }finally{origin.closeAllConnections();proxy.closeAllConnections();await Promise.all([new Promise(resolve=>origin.close(resolve)),new Promise(resolve=>proxy.close(resolve))]);}
});
