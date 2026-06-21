/** OLE/CFB compound document reader for InPage .inp files. */

const FREESECT = 0xffffffff;
const ENDOFCHAIN = 0xfffffffe;
const NOSTREAM = 0xffffffff;

function readU16(bytes, off) {
  return bytes[off] | (bytes[off + 1] << 8);
}

function readU32(bytes, off) {
  return (
    bytes[off] |
    (bytes[off + 1] << 8) |
    (bytes[off + 2] << 16) |
    (bytes[off + 3] << 24)
  ) >>> 0;
}

function readU64Safe(bytes, off) {
  const low = readU32(bytes, off);
  const high = readU32(bytes, off + 4);
  return high * 4294967296 + low;
}

function concatChunks(chunks) {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let p = 0;
  for (const c of chunks) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

export function hexPrefix(bytes, len) {
  const n = Math.min(len, bytes.length);
  let out = "";
  for (let i = 0; i < n; i += 1) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

function shaLike(bytes) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < bytes.length; i += 1) {
    h ^= bytes[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export class CfbReader {
  constructor(arrayBuffer) {
    this.bytes = new Uint8Array(arrayBuffer);
    this.header = this.parseHeader();
    this.sectorSize = 1 << this.header.sectorShift;
    this.miniSectorSize = 1 << this.header.miniSectorShift;
    this.fat = [];
    this.minifat = [];
    this.dirEntries = [];
    this.pathsById = new Map();
    this.rootEntry = null;

    this.loadFat();
    this.loadDirectory();
    this.buildPaths();
    this.loadMiniFat();
  }

  parseHeader() {
    const b = this.bytes;
    const magic = "d0cf11e0a1b11ae1";
    if (hexPrefix(b, 8) !== magic) throw new Error("Not a valid OLE/CFB file");
    return {
      minorVersion: readU16(b, 24),
      majorVersion: readU16(b, 26),
      byteOrder: readU16(b, 28),
      sectorShift: readU16(b, 30),
      miniSectorShift: readU16(b, 32),
      numDirSectors: readU32(b, 40),
      numFatSectors: readU32(b, 44),
      firstDirSector: readU32(b, 48),
      miniStreamCutoffSize: readU32(b, 56),
      firstMiniFatSector: readU32(b, 60),
      numMiniFatSectors: readU32(b, 64),
      firstDifatSector: readU32(b, 68),
      numDifatSectors: readU32(b, 72),
    };
  }

  sectorOffset(sid) {
    return (sid + 1) * this.sectorSize;
  }

  readSector(sid) {
    const off = this.sectorOffset(sid);
    return this.bytes.slice(off, off + this.sectorSize);
  }

  readChain(startSid, table, maxSteps = 50000) {
    if (startSid === NOSTREAM || startSid === ENDOFCHAIN) return [];
    const chain = [];
    const seen = new Set();
    let sid = startSid >>> 0;
    for (let i = 0; i < maxSteps; i += 1) {
      if (sid === NOSTREAM || sid === ENDOFCHAIN) break;
      if (sid >= table.length) break;
      if (seen.has(sid)) break;
      seen.add(sid);
      chain.push(sid);
      sid = table[sid] >>> 0;
    }
    return chain;
  }

  loadFat() {
    const difat = [];
    for (let i = 0; i < 109; i += 1) {
      const sid = readU32(this.bytes, 76 + i * 4);
      if (sid !== FREESECT) difat.push(sid);
    }

    let nextDifat = this.header.firstDifatSector;
    for (let i = 0; i < this.header.numDifatSectors; i += 1) {
      if (nextDifat === ENDOFCHAIN || nextDifat === FREESECT || nextDifat === NOSTREAM) break;
      const sec = this.readSector(nextDifat);
      const count = this.sectorSize / 4 - 1;
      for (let j = 0; j < count; j += 1) {
        const sid = readU32(sec, j * 4);
        if (sid !== FREESECT) difat.push(sid);
      }
      nextDifat = readU32(sec, this.sectorSize - 4);
    }

    const fat = [];
    for (const fatSid of difat) {
      const sec = this.readSector(fatSid);
      for (let i = 0; i < this.sectorSize; i += 4) fat.push(readU32(sec, i));
    }
    this.fat = fat;
  }

  loadDirectory() {
    const chain = this.readChain(this.header.firstDirSector, this.fat);
    const chunks = chain.map((sid) => this.readSector(sid));
    const bytes = concatChunks(chunks);
    const dec = new TextDecoder("utf-16le");
    const entries = [];

    for (let off = 0; off + 128 <= bytes.length; off += 128) {
      const ent = bytes.slice(off, off + 128);
      const nameLen = readU16(ent, 64);
      const nameRaw = ent.slice(0, Math.max(0, nameLen - 2));
      const name = dec.decode(nameRaw).replace(/\u0000+$/g, "");
      entries.push({
        entryId: off / 128,
        name,
        objType: ent[66],
        color: ent[67],
        leftId: readU32(ent, 68),
        rightId: readU32(ent, 72),
        childId: readU32(ent, 76),
        startSector: readU32(ent, 116),
        streamSize: readU64Safe(ent, 120),
      });
    }
    this.dirEntries = entries;
    this.rootEntry = entries.length > 0 ? entries[0] : null;
  }

  walkSiblingTree(nodeId, out) {
    if (nodeId === NOSTREAM || nodeId === FREESECT || nodeId >= this.dirEntries.length) return;
    const node = this.dirEntries[nodeId];
    this.walkSiblingTree(node.leftId, out);
    out.push(nodeId);
    this.walkSiblingTree(node.rightId, out);
  }

  buildPaths() {
    if (!this.rootEntry) return;
    this.pathsById.set(this.rootEntry.entryId, "/");
    const assign = (parentId, parentPath) => {
      const parent = this.dirEntries[parentId];
      const ids = [];
      this.walkSiblingTree(parent.childId, ids);
      for (const id of ids) {
        const ent = this.dirEntries[id];
        const name = ent.name || `entry_${id}`;
        const path = parentPath === "/" ? `/${name}` : `${parentPath}/${name}`;
        this.pathsById.set(id, path);
        if (ent.objType === 1 || ent.objType === 5) assign(id, path);
      }
    };
    assign(this.rootEntry.entryId, "/");
  }

  loadMiniFat() {
    const chain = this.readChain(this.header.firstMiniFatSector, this.fat);
    const mini = [];
    for (const sid of chain) {
      const sec = this.readSector(sid);
      for (let i = 0; i < sec.length; i += 4) mini.push(readU32(sec, i));
    }
    this.minifat = mini;
  }

  readNormalStream(startSector, size) {
    const chain = this.readChain(startSector, this.fat);
    const bytes = concatChunks(chain.map((sid) => this.readSector(sid))).slice(0, size);
    return { bytes, chain, allocation: "fat" };
  }

  readMiniStream(startMiniSector, size) {
    if (!this.rootEntry) return { bytes: new Uint8Array(0), chain: [], allocation: "minifat" };
    const root = this.readNormalStream(this.rootEntry.startSector, this.rootEntry.streamSize).bytes;
    const chain = this.readChain(startMiniSector, this.minifat);
    const parts = [];
    for (const msid of chain) {
      const off = msid * this.miniSectorSize;
      parts.push(root.slice(off, off + this.miniSectorSize));
    }
    return { bytes: concatChunks(parts).slice(0, size), chain, allocation: "minifat" };
  }

  readEntryStream(entry) {
    if (entry.objType !== 2 && entry.objType !== 5) {
      return { bytes: new Uint8Array(0), chain: [], allocation: "none" };
    }
    if (entry.objType === 5) return this.readNormalStream(entry.startSector, entry.streamSize);
    if (entry.streamSize < this.header.miniStreamCutoffSize) {
      return this.readMiniStream(entry.startSector, entry.streamSize);
    }
    return this.readNormalStream(entry.startSector, entry.streamSize);
  }

  getEntryByPath(path) {
    for (const entry of this.dirEntries) {
      if (this.pathsById.get(entry.entryId) === path) return entry;
    }
    return null;
  }

  getStreamByPath(path) {
    const entry = this.getEntryByPath(path);
    if (!entry) return null;
    return this.readEntryStream(entry);
  }

  manifest() {
    return this.dirEntries.map((entry) => {
      const path = this.pathsById.get(entry.entryId) || `/entry_${entry.entryId}`;
      let bytes = new Uint8Array(0);
      let chain = [];
      let allocation = "none";
      if (entry.objType === 2 || entry.objType === 5) {
        const stream = this.readEntryStream(entry);
        bytes = stream.bytes;
        chain = stream.chain;
        allocation = stream.allocation;
      }
      return {
        entryId: entry.entryId,
        path,
        name: entry.name,
        type: entry.objType === 5 ? "root" : entry.objType === 2 ? "stream" : entry.objType === 1 ? "storage" : "unknown",
        size: entry.streamSize,
        allocation,
        chainLen: chain.length,
        sha: bytes.length ? shaLike(bytes) : "",
        sampleHex: hexPrefix(bytes, 64),
      };
    });
  }
}

export function resolveContentStream(cfb) {
  const manifest = cfb.manifest();
  const inpageStreams = manifest.filter(
    (entry) => entry.type === "stream" && /^\/InPage\d+$/.test(entry.path) && entry.size > 0,
  );
  if (!inpageStreams.length) return null;

  for (const variant of ["300", "100"]) {
    const match = inpageStreams.find((entry) => entry.path === `/InPage${variant}`);
    if (match) {
      const stream = cfb.getStreamByPath(match.path);
      return {
        path: match.path,
        variant,
        bytes: stream.bytes,
        chain: stream.chain,
        allocation: stream.allocation,
      };
    }
  }

  const largest = [...inpageStreams].sort((a, b) => b.size - a.size)[0];
  const variant = largest.path.replace("/InPage", "");
  const stream = cfb.getStreamByPath(largest.path);
  return {
    path: largest.path,
    variant,
    bytes: stream.bytes,
    chain: stream.chain,
    allocation: stream.allocation,
  };
}
