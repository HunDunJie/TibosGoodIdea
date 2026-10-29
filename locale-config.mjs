import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import i18n from './i18n.js';
import {createHash} from 'node:crypto';
import {defaultStateDir} from './runtime-paths.mjs';
const here = path.dirname(fileURLToPath(import.meta.url));
export async function readConfig(file = path.join(here,'config.local.json'), stateDir = defaultStateDir()) {
  let raw = {}; try { raw = JSON.parse(await fs.readFile(file,'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw new Error('Invalid settings JSON. Open Settings to repair it.'); }
  let lastLanguage;
  try { const saved=JSON.parse(await fs.readFile(path.join(stateDir,'codex-language.json'),'utf8')); if(i18n.supportedLocales.includes(saved.language))lastLanguage=saved.language; } catch {}
  // The old config.language field is ignored. The renderer supplies Codex's actual locale.
  const language = i18n.create({timeZone:raw.timeZone},lastLanguage ?? process.env.BOTTOMBAR_UI_LANGUAGE ?? Intl.DateTimeFormat().resolvedOptions().locale);
  const audio = (value,name) => value ? path.resolve(path.dirname(file),value) : path.join(here,'sounds',name+'.wav');
  return {...raw,language:language.locale,uiTimeZone:raw.timeZone || 'auto',timeZone:language.timeZone,completionAudio:audio(raw.completionAudio,'completion'),refreshAudio:audio(raw.refreshAudio,'refresh')};
}
export function configFingerprint(config) {
  return createHash('sha256').update(JSON.stringify([config.uiTimeZone ?? config.timeZone,config.completionAudio,config.refreshAudio])).digest('hex');
}
