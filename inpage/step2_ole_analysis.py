"""Step 2 - OLE2 Container Analysis + Entropy + String Discovery
Since both files are OLE2 Compound Documents, we use olefile to extract streams.
Falls back to manual parsing if olefile is not installed.
"""
import os
import struct
import math
import re

output_file = 'inpage/step2_output.txt'
out = open(output_file, 'w', encoding='utf-8')

def p(s=''):
    out.write(s + '\n')

def entropy(data):
    """Calculate Shannon entropy of a byte sequence"""
    if len(data) == 0:
        return 0
    freq = [0] * 256
    for b in data:
        freq[b] += 1
    ent = 0
    for f in freq:
        if f > 0:
            prob = f / len(data)
            ent -= prob * math.log2(prob)
    return ent

def hex_dump(data, offset=0, max_lines=16):
    """Return hex dump string"""
    lines = []
    for i in range(0, min(len(data), max_lines * 16), 16):
        hex_part = ' '.join(f'{b:02X}' for b in data[i:i+16])
        ascii_part = ''.join(chr(b) if 32 <= b < 127 else '.' for b in data[i:i+16])
        lines.append(f"  {offset+i:08X}: {hex_part:<48s} |{ascii_part}|")
    return '\n'.join(lines)

# Try to use olefile
try:
    import olefile
    HAS_OLEFILE = True
    p("olefile library available - using it for OLE2 parsing")
except ImportError:
    HAS_OLEFILE = False
    p("olefile not available - will attempt manual OLE2 parsing")

files = ['inpage/juz_29.inp', 'inpage/juz_30.inp']

for fpath in files:
    p(f"\n{'='*80}")
    p(f"FILE: {fpath}")
    p(f"{'='*80}")
    
    with open(fpath, 'rb') as f:
        raw_data = f.read()
    
    # ===== ENTROPY ANALYSIS =====
    p(f"\n--- ENTROPY ANALYSIS (1024-byte blocks) ---")
    block_size = 1024
    p(f"{'OFFSET':>10} | {'ENTROPY':>8} | {'CLASSIFICATION'}")
    p(f"{'-'*10}-+-{'-'*8}-+-{'-'*30}")
    
    entropy_map = []
    for i in range(0, len(raw_data), block_size):
        block = raw_data[i:i+block_size]
        ent = entropy(block)
        
        if ent < 1.0:
            classification = "EMPTY/PADDING"
        elif ent < 3.0:
            classification = "STRUCTURED DATA"
        elif ent < 5.0:
            classification = "TEXT/MIXED"
        elif ent < 7.0:
            classification = "BINARY DATA"
        elif ent < 7.5:
            classification = "POSSIBLY COMPRESSED"
        else:
            classification = "COMPRESSED/ENCRYPTED"
        
        entropy_map.append((i, ent, classification))
        # Only print non-empty blocks to keep output manageable
        if ent > 0.5:
            p(f"  0x{i:08X} | {ent:8.4f} | {classification}")
    
    # Summary
    p(f"\n  Entropy Summary:")
    empty_blocks = sum(1 for _, e, _ in entropy_map if e < 1.0)
    struct_blocks = sum(1 for _, e, _ in entropy_map if 1.0 <= e < 3.0)
    text_blocks = sum(1 for _, e, _ in entropy_map if 3.0 <= e < 5.0)
    binary_blocks = sum(1 for _, e, _ in entropy_map if 5.0 <= e < 7.0)
    compressed_blocks = sum(1 for _, e, _ in entropy_map if e >= 7.0)
    total = len(entropy_map)
    p(f"    Empty/Padding: {empty_blocks}/{total}")
    p(f"    Structured:    {struct_blocks}/{total}")
    p(f"    Text/Mixed:    {text_blocks}/{total}")
    p(f"    Binary:        {binary_blocks}/{total}")
    p(f"    Compressed:    {compressed_blocks}/{total}")
    
    # ===== OLE2 STREAM ANALYSIS =====
    if HAS_OLEFILE:
        p(f"\n--- OLE2 STREAM ANALYSIS ---")
        try:
            ole = olefile.OleFileIO(fpath)
            
            # List all streams
            p(f"\n  OLE2 Streams:")
            for stream in ole.listdir():
                stream_path = '/'.join(stream)
                stream_size = ole.get_size(stream_path)
                p(f"    [{stream_size:>10,} bytes] {stream_path}")
            
            # Detailed analysis of each stream
            for stream in ole.listdir():
                stream_path = '/'.join(stream)
                stream_size = ole.get_size(stream_path)
                stream_data = ole.openstream(stream_path).read()
                stream_ent = entropy(stream_data)
                
                p(f"\n  --- Stream: {stream_path} ---")
                p(f"  Size: {stream_size:,} bytes")
                p(f"  Entropy: {stream_ent:.4f}")
                
                # First 256 bytes
                p(f"  First 256 bytes:")
                p(hex_dump(stream_data[:256]))
                
                # Last 128 bytes
                if len(stream_data) > 256:
                    p(f"  Last 128 bytes:")
                    start = max(0, len(stream_data) - 128)
                    p(hex_dump(stream_data[start:], offset=start))
                
                # Check for compression signatures
                if stream_data[:2] == b'\x78\x9c':
                    p(f"  ** ZLIB compressed data detected! **")
                elif stream_data[:2] == b'\x1f\x8b':
                    p(f"  ** GZIP compressed data detected! **")
                
                # Scan for UTF-16 strings in this stream
                utf16_strings = []
                i = 0
                while i < len(stream_data) - 1:
                    # Look for sequences of UTF-16LE chars (Arabic/Urdu range: 0x0600-0x06FF)
                    if stream_data[i+1] == 0x06 or (stream_data[i+1] == 0x00 and 0x20 <= stream_data[i] < 0x7F):
                        start_pos = i
                        chars = []
                        while i < len(stream_data) - 1:
                            code = struct.unpack_from('<H', stream_data, i)[0]
                            if (0x0600 <= code <= 0x06FF) or (0x0020 <= code <= 0x007E) or (0xFB50 <= code <= 0xFDFF) or (0xFE70 <= code <= 0xFEFF) or code in (0x000A, 0x000D, 0x200C, 0x200D, 0x200E, 0x200F):
                                chars.append(chr(code))
                                i += 2
                            else:
                                break
                        if len(chars) >= 3:
                            text = ''.join(chars)
                            utf16_strings.append((start_pos, text))
                    else:
                        i += 2
                
                if utf16_strings:
                    p(f"\n  UTF-16 Strings found ({len(utf16_strings)} sequences):")
                    for offset, text in utf16_strings[:30]:  # Show first 30
                        display = text[:80]
                        p(f"    Offset 0x{offset:08X}: [{len(text)} chars] {display}")
                    if len(utf16_strings) > 30:
                        p(f"    ... and {len(utf16_strings) - 30} more")
                
                # Scan for ASCII strings
                ascii_strings = re.findall(rb'[\x20-\x7E]{6,}', stream_data)
                if ascii_strings:
                    p(f"\n  ASCII Strings found ({len(ascii_strings)}):")
                    for s in ascii_strings[:20]:
                        p(f"    {s.decode('ascii')}")
                    if len(ascii_strings) > 20:
                        p(f"    ... and {len(ascii_strings) - 20} more")
            
            # OLE metadata
            p(f"\n  --- OLE2 Metadata ---")
            meta = ole.get_metadata()
            for attr in ['title', 'subject', 'author', 'keywords', 'comments',
                        'template', 'last_saved_by', 'revision_number',
                        'total_edit_time', 'last_printed', 'create_time',
                        'last_saved_time', 'num_pages', 'num_words', 'num_chars',
                        'creating_application']:
                val = getattr(meta, attr, None)
                if val:
                    p(f"    {attr}: {val}")
            
            ole.close()
        except Exception as e:
            p(f"  ERROR: {e}")
            import traceback
            p(traceback.format_exc())
    else:
        # Manual OLE2 parsing fallback
        p(f"\n--- MANUAL STRING SCAN (no olefile) ---")
        
        # Scan for ASCII strings
        ascii_strings = re.findall(rb'[\x20-\x7E]{6,}', raw_data)
        p(f"\n  ASCII Strings ({len(ascii_strings)} found):")
        for s in ascii_strings[:50]:
            p(f"    {s.decode('ascii')}")
        
        # Scan for UTF-16LE strings
        p(f"\n  Scanning for UTF-16 Arabic/Urdu text blocks...")
        i = 0
        utf16_blocks = []
        while i < len(raw_data) - 1:
            code = struct.unpack_from('<H', raw_data, i)[0]
            if 0x0600 <= code <= 0x06FF:
                start_pos = i
                chars = []
                while i < len(raw_data) - 1:
                    code = struct.unpack_from('<H', raw_data, i)[0]
                    if (0x0600 <= code <= 0x06FF) or (0x0020 <= code <= 0x007E) or (0xFB50 <= code <= 0xFDFF) or (0xFE70 <= code <= 0xFEFF) or code in (0x000A, 0x000D, 0x200C, 0x200D):
                        chars.append(chr(code))
                        i += 2
                    else:
                        break
                if len(chars) >= 5:
                    text = ''.join(chars)
                    utf16_blocks.append((start_pos, len(chars), text))
            else:
                i += 2
        
        p(f"\n  UTF-16 Arabic/Urdu blocks ({len(utf16_blocks)} found):")
        for offset, length, text in utf16_blocks[:30]:
            display = text[:80]
            p(f"    Offset 0x{offset:08X}: [{length} chars] {display}")

p("\n\nDone with Step 2 analysis.")
out.close()
print(f"Output written to {output_file}")
