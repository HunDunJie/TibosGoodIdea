import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readConfig,configFingerprint} from '../locale-config.mjs';
test('portable settings resolve locale, default tones and relative WAV paths',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'cqb-locale-test-'));
  try{
    const file=path.join(folder,'config.json');await fs.writeFile(file,JSON.stringify({language:'en',timeZone:'UTC',completionAudio:'mine.wav'}));
    const config=await readConfig(file);
    assert.equal(config.language,'en');assert.equal(config.timeZone,'UTC');
    assert.equal(config.completionAudio,path.join(folder,'mine.wav'));
    assert.ok(config.refreshAudio.endsWith(path.join('sounds','refresh.wav')));
    assert.equal(configFingerprint(config),configFingerprint({...config,unusedProperty:1}));
    assert.notEqual(configFingerprint(config),configFingerprint({...config,language:'zh-CN'}));
  }finally{if(path.dirname(folder)===path.resolve(os.tmpdir())&&path.basename(folder).startsWith('cqb-locale-test-'))await fs.rm(folder,{recursive:true,force:true});}
});
