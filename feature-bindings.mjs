import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

// Version gate: these private renderer APIs must never be guessed after a client update.
const supported = {
  'app-initial-db76c3384587.js':'8511d0206f33dfd5bcc5f2a9d2273c9952f4844c9d79fdfb0404634d7a9d5723',
  'app-shared-3b88f728481f.js':'049e002cddcc8b63436e0197d3f061302eafa7e760379b5937e3ea876384ccd7',
  'composer-content-b105c3967bfa.js':'22b12a52038740d1e82fffbf02e5507bc1144ea708f88cbfe5384bec30198a87',
};
export async function readFeatureBindings(asarPath) {
  const file = await fs.open(asarPath,'r');
  try {
    const head = Buffer.alloc(16); await file.read(head,0,16,0);
    const size = head.readUInt32LE(12); if (size > 32*1024*1024) throw new Error('Archive header too large');
    const bytes = Buffer.alloc(size); await file.read(bytes,0,size,16);
    const entries = new Map();
    function walk(node,prefix='') { for (const [name,entry] of Object.entries(node.files ?? {})) { const full = prefix ? `${prefix}/${name}` : name; if (entry.files) walk(entry,full); else if (name in supported) entries.set(name,entry); } }
    walk(JSON.parse(bytes.toString('utf8')));
    for (const [name,hash] of Object.entries(supported)) {
      const entry = entries.get(name);
      if (!entry || entry.unpacked || entry.size > 12*1024*1024) throw new Error('Unsupported Codex renderer');
      if (hash) {
        const content = Buffer.alloc(entry.size); await file.read(content,0,content.length,8+head.readUInt32LE(4)+Number(entry.offset));
        if (createHash('sha256').update(content).digest('hex') !== hash) throw new Error('Codex renderer fingerprint changed');
      }
    }
    return {version:'26.1023.6621.0', initial:path.basename(Object.keys(supported)[0]), shared:path.basename(Object.keys(supported)[1]),
      scope:'uct', retainedScope:'lwt', initEvents:'ICn', completionEvent:'ZCn', initComposer:'fpt', composerScope:'MQn',
      readStorage:'Ntr', draft:'Sft', prompt:'Hft', navigation:'ZAn', navigateLocal:'tjn', conversationBinding:'b0n', composerKey:'HQn', host:'VJn'};
  } finally { await file.close(); }
}
