import http from 'node:http';
import https from 'node:https';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile);
let systemCache=null,systemCheckedAt=0;
async function windowsProxy() {
  if(process.platform!=='win32')return {};
  if(systemCache && Date.now()-systemCheckedAt<30000)return systemCache;
  try {
    const command="$p=Get-ItemProperty -LiteralPath 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';@{enabled=$p.ProxyEnable;server=$p.ProxyServer;bypass=$p.ProxyOverride}|ConvertTo-Json -Compress";
    const {stdout}=await execute('powershell.exe',['-NoProfile','-NonInteractive','-Command',command],{windowsHide:true,timeout:3000,maxBuffer:8192});
    systemCache=JSON.parse(stdout);systemCheckedAt=Date.now();return systemCache;
  }catch{return {};}
}
function proxyURL(value) {
  if(typeof value!=='string'||!value.trim())return null;
  try {const url=new URL(value.includes('://')?value.trim():'http://'+value.trim());return ['http:','https:'].includes(url.protocol)?url.href:null;}catch{return null;}
}
export async function proxyEnvironment(url,{env=process.env,systemProxy=windowsProxy}={}) {
  const protocol=new URL(url).protocol;
  const explicit=protocol==='https:'?env.https_proxy??env.HTTPS_PROXY??env.all_proxy??env.ALL_PROXY??env.http_proxy??env.HTTP_PROXY:env.http_proxy??env.HTTP_PROXY??env.all_proxy??env.ALL_PROXY;
  let proxy=proxyURL(explicit),bypass=env.no_proxy??env.NO_PROXY??'';
  if(!proxy) {
    const settings=await systemProxy();
    if(settings.enabled===1 && typeof settings.server==='string') {
      const entries=settings.server.split(';').map(value=>value.trim()).filter(Boolean);
      const scheme=protocol.slice(0,-1)+'=';
      proxy=proxyURL(entries.find(value=>value.startsWith(scheme))?.slice(scheme.length)??entries.find(value=>!value.includes('=')));
      if(!bypass)bypass=(settings.bypass??'').replaceAll(';',',').replace(/<local>/gi,'localhost');
    }
  }
  return proxy?{HTTP_PROXY:proxy,HTTPS_PROXY:proxy,NO_PROXY:bypass}:null;
}
function requestBytes(url,options,proxyEnv) {
  return new Promise((resolve,reject)=>{
    const protocol=new URL(url).protocol;
    const transport=protocol==='https:'?https:protocol==='http:'?http:null;
    if(!transport){reject(Error('Unsupported update protocol'));return;}
    // Per-request agents keep proxy settings away from loopback services and other fetches.
    const agent=new transport.Agent({proxyEnv:proxyEnv??{},keepAlive:false});
    let headerTimer,request,settled=false;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(headerTimer);agent.destroy();error?reject(error):resolve(value);};
    try {
      request=transport.request(url,{agent,headers:options.headers,signal:options.signal},response=>{
        clearTimeout(headerTimer);
        const status=response.statusCode,headers=new Headers();
        for(let i=0;i<response.rawHeaders.length;i+=2)headers.append(response.rawHeaders[i],response.rawHeaders[i+1]);
        if(status>=400){response.destroy();finish(Error('Update request rejected'));return;}
        if(status>=300&&status<400){
          response.destroy();
          if(options.redirect==='error')finish(Error('Update redirect rejected'));
          else finish(null,new Response(null,{status,headers}));
          return;
        }
        const limit=options.maxBytes??512*1024;
        if(Number(headers.get('content-length'))>limit){response.destroy();finish(Error('Update response too large'));return;}
        let size=0;const chunks=[];
        response.on('data',chunk=>{size+=chunk.length;if(size>limit){response.destroy();finish(Error('Update response too large'));}else chunks.push(chunk);});
        response.once('end',()=>{try{finish(null,new Response(Buffer.concat(chunks),{status,headers}));}catch{finish(Error('Invalid update response'));}});
        response.once('error',()=>finish(Error('Update response interrupted')));
        response.once('aborted',()=>finish(Error('Update response interrupted')));
      });
      headerTimer=setTimeout(()=>request.destroy(Error('Update connection timed out')),3500);
      request.setTimeout(10000,()=>request.destroy(Error('Update transfer timed out')));
      request.once('error',()=>finish(Error('Update connection failed')));
      request.end();
    }catch{finish(Error('Update connection failed'));}
  });
}
export function createUpdateFetch({env=process.env,systemProxy=windowsProxy,requestImpl=requestBytes}={}) {
  return async function updateFetch(url,options={}) {
    options.signal?.throwIfAborted();
    const proxy=await proxyEnvironment(url,{env,systemProxy});
    if(proxy) {
      try{return await requestImpl(url,options,proxy);}catch{options.signal?.throwIfAborted();}
    }
    return requestImpl(url,options,null);
  };
}
export const updateFetch=createUpdateFetch();
