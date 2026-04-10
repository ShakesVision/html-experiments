"""Step 1 - Binary Reconnaissance: File sizes, hex dumps, magic number identification"""
import os
import sys

# Write output to file for reliable reading
output_file = 'inpage/step1_output.txt'
out = open(output_file, 'w', encoding='utf-8')

def p(s=''):
    out.write(s + '\n')

files = ['inpage/juz_29.inp', 'inpage/juz_30.inp']

for fpath in files:
    size = os.path.getsize(fpath)
    p(f"\n{'='*80}")
    p(f"FILE: {fpath}")
    p(f"SIZE: {size:,} bytes ({size/1024:.1f} KB)")
    p(f"{'='*80}")
    
    with open(fpath, 'rb') as f:
        data = f.read()
    
    # First 1024 bytes hex dump
    p(f"\n--- FIRST 1024 BYTES ---")
    for i in range(0, min(1024, len(data)), 16):
        hex_part = ' '.join(f'{b:02X}' for b in data[i:i+16])
        ascii_part = ''.join(chr(b) if 32 <= b < 127 else '.' for b in data[i:i+16])
        p(f"  {i:08X}: {hex_part:<48s} |{ascii_part}|")
    
    # Last 256 bytes hex dump
    p(f"\n--- LAST 256 BYTES ---")
    start = max(0, len(data) - 256)
    for i in range(start, len(data), 16):
        hex_part = ' '.join(f'{b:02X}' for b in data[i:i+16])
        ascii_part = ''.join(chr(b) if 32 <= b < 127 else '.' for b in data[i:i+16])
        p(f"  {i:08X}: {hex_part:<48s} |{ascii_part}|")
    
    # Magic number analysis
    p(f"\n--- MAGIC NUMBER ANALYSIS ---")
    p(f"  First 4 bytes: {' '.join(f'{b:02X}' for b in data[:4])}")
    p(f"  First 8 bytes: {' '.join(f'{b:02X}' for b in data[:8])}")
    p(f"  First 16 bytes: {' '.join(f'{b:02X}' for b in data[:16])}")
    
    # Check for known signatures
    if data[:2] == b'PK':
        p("  -> ZIP/OOXML signature detected")
    elif data[:4] == b'\xd0\xcf\x11\xe0':
        p("  -> OLE2 Compound Document signature detected")
    elif data[:2] == b'\x1f\x8b':
        p("  -> GZIP signature detected")
    elif data[:2] == b'\x78\x9c':
        p("  -> ZLIB signature detected")
    else:
        p(f"  -> Unknown signature: {data[:4]}")
        try:
            ascii_sig = data[:8].decode('ascii', errors='replace')
            p(f"  -> ASCII interpretation: '{ascii_sig}'")
        except:
            pass
    
    # Look for potential version markers in first 128 bytes
    p(f"\n--- POTENTIAL VERSION/STRUCTURE MARKERS (first 128 bytes as LE uint32) ---")
    for i in range(0, 128, 4):
        val_le = int.from_bytes(data[i:i+4], 'little')
        if 0 < val_le < size and val_le > 100:
            p(f"  Offset 0x{i:04X}: LE uint32 = {val_le} (0x{val_le:08X}) - possible file offset/pointer")
    
    # Also check uint16 values
    p(f"\n--- POTENTIAL UINT16 VALUES (first 128 bytes as LE uint16) ---")
    for i in range(0, 128, 2):
        val = int.from_bytes(data[i:i+2], 'little')
        p(f"  Offset 0x{i:04X}: {val} (0x{val:04X})")

p("\n\nDone with Step 1 reconnaissance.")
out.close()
print(f"Output written to {output_file}")
