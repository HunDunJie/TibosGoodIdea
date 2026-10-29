import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import i18n from './i18n.js';
import {createHash} from 'node:crypto';
const here = path.dirname(fileURLToPath(import.meta.url));
export async function readConfig(file = path.join(here,'config.local.json')) {
  let raw = {}; try { raw = JSON.parse(await fs.readFile(file,'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error('Invalid settings JSON. Open Settings to repair it.'); }
  const language = i18n.create(raw,process.env.BOTTOMBAR_UI_LANGUAGE ?? Intl.DateTimeFormat().resolvedOptions().locale);
  const audio = (value,name) => value ? path.resolve(path.dirname(file),value) : path.join(here,'sounds',name+'.wav');
  return {...raw,language:language.locale,timeZone:language.timeZone,completionAudio:audio(raw.completionAudio,'completion'),refreshAudio:audio(raw.refreshAudio,'refresh')};
}
export function configFingerprint(config) {
  return createHash('sha256').update(JSON.stringify([config.language,config.timeZone,config.completionAudio,config.refreshAudio])).digest('hex');
}
