import fs from 'node:fs/promises';
import path from 'node:path';

// Resolve the current installed renderer's exported native modal API, without executing source.
export async function readNativeBindings(asarPath) {
  const file = await fs.open(asarPath, 'r');
  try {
    const head = Buffer.alloc(16); await file.read(head, 0, 16, 0);
    const base = 8 + head.readUInt32LE(4), size = head.readUInt32LE(12);
    if (size > 32 * 1024 * 1024) throw new Error('Unexpected archive header');
    const bytes = Buffer.alloc(size); await file.read(bytes, 0, size, 16);
    const entries = new Map();
    function walk(node, prefix = '') {
      for (const [name, entry] of Object.entries(node.files ?? {})) {
        const full = prefix ? `${prefix}/${name}` : name;
        if (entry.files) walk(entry, full); else entries.set(full, entry);
      }
    }
    walk(JSON.parse(bytes.toString('utf8')));
    async function read(full) {
      const item = entries.get(full);
      if (!item || item.unpacked || item.size > 20 * 1024 * 1024) throw new Error('Native module unavailable');
      const content = Buffer.alloc(item.size); await file.read(content, 0, content.length, base + Number(item.offset));
      return content.toString('utf8');
    }
    function imports(source) {
      const map = new Map();
      for (const match of source.matchAll(/import\{([^}]+)\}from["']([^"']+)["']/g)) {
        for (const item of match[1].split(',')) {
          const parts = item.trim().split(/\s+as\s+/);
          map.set(parts[1] ?? parts[0], {module:path.posix.basename(match[2]), export:parts[0]});
        }
      }
      return map;
    }
    const profilePath = [...entries.keys()].find(name => /\/profile-dropdown-items-[^/]+\.js$/.test(name));
    if (!profilePath) throw new Error('Profile module not found');
    const source = await read(profilePath), names = imports(source);
    const open = source.match(/([\w$]+)\(([\w$]+),([\w$]+),\{defaultResetCreditsOpen:!0/);
    if (!open) throw new Error('Native usage opener not found');
    const storeName = open[2];
    const scopes = [...source.slice(0, open.index).matchAll(new RegExp(`\\b${storeName}=([\\w$]+)\\(([\\w$]+)\\)`, 'g'))];
    const scope = scopes.map(match => names.get(match[2])).findLast(binding => binding?.module.startsWith('app-shared-'));
    const callback = source.slice(open.index, open.index + 1000);
    const turn = callback.match(new RegExp(`${storeName}\\.get\\(([\\w$]+),([\\w$]+)\\)`));
    const record = callback.match(new RegExp(`([\\w$]+)\\(${storeName},\\{accountId:[^,]+,conversationId:[\\w$]+,turnId:`));
    if (!scope || !turn || !record) throw new Error('Native usage context not found');
    const conversationHook = [...source.slice(0, open.index).matchAll(new RegExp(`\\b${turn[2]}=([\\w$]+)\\(\\)`, 'g'))].map(match => names.get(match[1])).findLast(Boolean);
    let decodeConversation = null;
    if (conversationHook) {
      const modulePath = path.posix.join(path.posix.dirname(profilePath), conversationHook.module);
      const moduleSource = await read(modulePath), moduleNames = imports(moduleSource);
      const exportName = conversationHook.export.replace(/[$]/g, '\\$&');
      const local = moduleSource.slice(moduleSource.lastIndexOf('export{')).match(new RegExp(`([\\w$]+) as ${exportName}(?:,|})`))?.[1];
      const start = local ? moduleSource.indexOf(`function ${local}(`) : -1;
      if (start >= 0) {
        const cast = moduleSource.slice(start, start + 900).match(/\?([\w$]+)\([\w$]+\):null/);
        if (cast) decodeConversation = moduleNames.get(cast[1]) ?? null;
      }
    }
    const result = {profileModule:path.posix.basename(profilePath), scope, openModal:names.get(open[1]), usageModal:names.get(open[3]), turn:names.get(turn[1]), recordReset:names.get(record[1]), decodeConversation};
    if (!result.openModal || !result.usageModal || !result.turn || !result.recordReset || !decodeConversation) throw new Error('Incomplete native usage bindings');
    return result;
  } finally { await file.close(); }
}
