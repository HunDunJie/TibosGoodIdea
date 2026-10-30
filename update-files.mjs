import fs from 'node:fs/promises';
import path from 'node:path';
import {inflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
export const sha256=value=>createHash('sha256').update(value).digest('hex');
export function safeRelative(name){
  if(typeof name!=='string'||name.length>220||/[^\x20-\x7e\u0080-\uffff]/.test(name)||/[\\:<>"|?*]/.test(name)||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..'||/[. ]$/.test(p)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)))throw Error('Unsafe package path');
  return name;
}
export async function noLinks(root,file=root){
  const base=path.resolve(root),target=path.resolve(file);
  if(target!==base&&!target.startsWith(base+path.sep))throw Error('Path escaped installation');
  for(let current=target;;current=path.dirname(current)){
    const stat=await fs.lstat(current).catch(e=>{if(e.code!=='ENOENT')throw e;return null;});
    if(stat?.isSymbolicLink())throw Error('Linked installation path');
    if(path.dirname(current)===current)break;
  }
}
const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(data){let crc=0xffffffff;for(const n of data)crc=crcTable[(crc^n)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export function readPackage(zip){
  if(zip.length>96*1024*1024)throw Error('Package too large');
  let end=-1;for(let i=zip.length-22;i>=Math.max(0,zip.length-65557);i--)if(zip.readUInt32LE(i)===0x06054b50&&i+22+zip.readUInt16LE(i+20)===zip.length){end=i;break;}
  if(end<0||zip.readUInt16LE(end+4)||zip.readUInt16LE(end+6)||zip.readUInt16LE(end+8)!==zip.readUInt16LE(end+10))throw Error('Unsupported ZIP');
  const count=zip.readUInt16LE(end+10),size=zip.readUInt32LE(end+12),start=zip.readUInt32LE(end+16);
  if(!count||count>256||start+size!==end)throw Error('Invalid ZIP directory');
  let at=start,total=0;const entries=new Map(),seen=new Set(),extents=[];
  for(let i=0;i<count;i++){
    if(at+46>end||zip.readUInt32LE(at)!==0x02014b50)throw Error('Invalid ZIP entry');
    const flags=zip.readUInt16LE(at+8),method=zip.readUInt16LE(at+10),crc=zip.readUInt32LE(at+16),packed=zip.readUInt32LE(at+20),unpacked=zip.readUInt32LE(at+24),n=zip.readUInt16LE(at+28),extra=zip.readUInt16LE(at+30),comment=zip.readUInt16LE(at+32),mode=zip.readUInt32LE(at+38)>>>16,local=zip.readUInt32LE(at+42);
    if(at+46+n+extra+comment>end||flags&1||![0,8].includes(method)||(mode&0xf000)===0xa000||zip.readUInt16LE(at+34))throw Error('Unsupported ZIP entry');
    const nameBytes=zip.subarray(at+46,at+46+n),name=nameBytes.toString('utf8');
    if(!Buffer.from(name,'utf8').equals(nameBytes)||!name.startsWith('TibosGoodIdea/'))throw Error('Invalid package prefix');
    const relative=safeRelative(name.slice(14));
    if(seen.has(relative.toLowerCase()))throw Error('Duplicate ZIP path');seen.add(relative.toLowerCase());
    total+=unpacked;if(unpacked>128*1024*1024||total>256*1024*1024||packed===0&&unpacked>0||local+30>start||zip.readUInt32LE(local)!==0x04034b50)throw Error('ZIP limits exceeded');
    const ln=zip.readUInt16LE(local+26),le=zip.readUInt16LE(local+28),data=local+30+ln+le;
    if(data+packed>start||!zip.subarray(local+30,local+30+ln).equals(nameBytes)||zip.readUInt16LE(local+8)!==method||zip.readUInt16LE(local+6)!==flags)throw Error('ZIP local header mismatch');
    extents.push([local,data+packed]);
    const bytes=method===0?Buffer.from(zip.subarray(data,data+packed)):inflateRawSync(zip.subarray(data,data+packed),{maxOutputLength:Math.max(1,unpacked)});
    if(bytes.length!==unpacked||crc32(bytes)!==crc)throw Error('ZIP checksum mismatch');entries.set(relative,bytes);
    at+=46+n+extra+comment;
  }
  if(at!==end)throw Error('Invalid ZIP directory size');
  extents.sort((a,b)=>a[0]-b[0]);if(extents.some((e,i)=>i&&e[0]<extents[i-1][1]))throw Error('Overlapping ZIP records');
  const manifest=JSON.parse(entries.get('SHA256-MANIFEST.json')?.toString()??'null');
  const files=JSON.parse(entries.get('release-files.json')?.toString()??'null');
  if(!manifest||!Array.isArray(files)||files.length!==entries.size-1||new Set(files.map(n=>n.toLowerCase())).size!==files.length||Object.keys(manifest).length!==files.length)throw Error('Invalid package inventory');
  for(const name of files){safeRelative(name);if(!entries.has(name)||sha256(entries.get(name))!==manifest[name])throw Error('Package manifest mismatch');}
  return {entries,manifest,files,total,manifestSha256:sha256(entries.get('SHA256-MANIFEST.json'))};
}
export async function removeOwnedDirectory(root,directory,files){
  await noLinks(root,directory);
  const dirs=new Set();
  for(const name of files){safeRelative(name);const file=path.join(directory,name);await noLinks(directory,file);await fs.unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});for(let p=path.dirname(file);p!==directory;p=path.dirname(p))dirs.add(p);}
  for(const dir of [...dirs].sort((a,b)=>b.length-a.length))await fs.rmdir(dir).catch(e=>{if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;});
  await fs.rmdir(directory).catch(e=>{if(!['ENOENT','ENOTEMPTY','EEXIST'].includes(e.code))throw e;});
}
