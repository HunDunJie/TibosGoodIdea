import fs from 'node:fs/promises';
import path from 'node:path';
try {
  const file=path.resolve(process.argv[2]),value=JSON.parse(await fs.readFile(file,'utf8'));
  if (!['auto','zh-CN','en'].includes(value.language)) throw Error('Unsupported language');
  if (value.timeZone && value.timeZone!=='auto') new Intl.DateTimeFormat('en',{timeZone:value.timeZone}).format();
  for(const name of ['completionAudio','refreshAudio']) if(value[name]) {
    const audio=path.resolve(path.dirname(file),value[name]),stat=await fs.stat(audio);
    if(!/\.wav$/i.test(audio)||!stat.isFile()||stat.size>128*1024*1024)throw Error('Choose a WAV file smaller than 128 MB');
    const handle=await fs.open(audio,'r');try{const header=Buffer.alloc(12);await handle.read(header,0,12,0);if(header.toString('ascii',0,4)!=='RIFF'||header.toString('ascii',8,12)!=='WAVE')throw Error('Invalid WAV header');}finally{await handle.close();}
  }
  console.log('OK');
} catch(e) { console.log(e.code==='ENOENT'?'WAV file not found / 找不到提示音文件':String(e.message).slice(0,240));process.exitCode=1; }
