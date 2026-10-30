import fs from 'node:fs/promises';
export async function openRendererArchive(filePath) {
  const file = await fs.open(filePath, 'r');
  async function readBytes(size, offset) {
    if (!Number.isSafeInteger(size) || size < 0 || !Number.isSafeInteger(offset) || offset < 0) throw Error('Invalid archive extent');
    const bytes = Buffer.alloc(size), result = await file.read(bytes, 0, size, offset);
    if (result.bytesRead !== size) throw Error('Truncated archive');
    return bytes;
  }
  try {
    const head = await readBytes(16, 0), size = head.readUInt32LE(12), base = 8 + head.readUInt32LE(4);
    if (size > 32 * 1024 * 1024 || base < 16 + size) throw Error('Invalid archive header');
    const index = JSON.parse((await readBytes(size, 16)).toString('utf8')), entries = new Map();
    function walk(node, prefix = '', depth = 0) {
      if (depth > 16) throw Error('Archive nesting exceeds limit');
      for (const [name, entry] of Object.entries(node.files ?? {})) {
        const full = prefix ? `${prefix}/${name}` : name;
        if (entry.files) walk(entry, full, depth + 1);
        else if (/^webview\/assets\/[\w.-]+\.js$/.test(full)) entries.set(full.split('/').at(-1), entry);
      }
    }
    walk(index);
    return {names:[...entries.keys()], async read(name) {
      const item = entries.get(name);
      if (!item || item.unpacked || item.link || !Number.isSafeInteger(item.size) || item.size > 20 * 1024 * 1024) throw Error('Renderer asset unavailable');
      return readBytes(item.size, base + Number(item.offset));
    }, close:() => file.close()};
  } catch (error) { await file.close(); throw error; }
}
