import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readConfig,configFingerprint} from '../locale-config.mjs';
import {createRequire} from 'node:module';
const i18n=createRequire(import.meta.url)('../i18n.js');
test('portable settings ignore legacy overrides and use the last Codex locale',async()=>{
  const folder=await fs.mkdtemp(path.join(os.tmpdir(),'cqb-locale-test-'));
  try{
    const file=path.join(folder,'config.json');await fs.writeFile(file,JSON.stringify({language:'en',timeZone:'UTC',completionAudio:'mine.wav'}));
    await fs.writeFile(path.join(folder,'codex-language.json'),JSON.stringify({language:'ja'}));
    const config=await readConfig(file,folder);
    assert.equal(config.language,'ja');assert.equal(config.timeZone,'UTC');
    assert.equal(config.completionAudio,path.join(folder,'mine.wav'));
    assert.ok(config.refreshAudio.endsWith(path.join('sounds','refresh.wav')));
    assert.equal(configFingerprint(config),configFingerprint({...config,unusedProperty:1}));
    assert.equal(configFingerprint(config),configFingerprint({...config,language:'zh-CN'}),'A live language change must not restart reminders');
    assert.notEqual(configFingerprint(config),configFingerprint({...config,uiTimeZone:'Asia/Tokyo'}));
  }finally{if(path.dirname(folder)===path.resolve(os.tmpdir())&&path.basename(folder).startsWith('cqb-locale-test-'))await fs.rm(folder,{recursive:true,force:true});}
});
test('Codex locale variants resolve to Chinese, English or Japanese',()=>{
  for(const [source,expected] of [['zh-CN','zh-CN'],['zh-Hans','zh-CN'],['zh-TW','zh-CN'],['en-US','en'],['en-GB','en'],['ja-JP','ja'],['ja','ja'],['fr-FR','en']])assert.equal(i18n.normalizeLocale(source),expected);
});
test('every add-on translation key has a Japanese translation and preserves substitutions',()=>{
  const ja=i18n.create({language:'ja',timeZone:'Asia/Tokyo'});
  for(const key of i18n.translationKeys)assert.notEqual(ja.t(key),'操作を完了できません ローカルログを確認してください','Missing Japanese: '+key);
  assert.equal(ja.t('将于{time}播放音乐提醒',{time:'11-01 10:30'}),'11-01 10:30 に音楽で通知します');
  assert.equal(ja.t('已开启'),'オン');assert.equal(ja.t('已关闭'),'オフ');
  assert.equal(ja.t('設定で読み取り可能な WAV ファイルを選択してください'),'設定で読み取り可能な WAV ファイルを選択してください','Already-localized player errors stay readable');
});
