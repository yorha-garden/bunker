"""Clean re-derivation: build full GF(2) linear system for keyhex from tag observations.
Unknowns (896 bits): keyhex[0:256] | KS1 | KS2 | KS3 | KS4 | S  (columns 256..895)
Measure residual dimension of keyhex under (a) full tags, (b) high-nibbles only.
"""
import os, sys
import gcmlib as G
from Crypto.Cipher import AES

TEMPLATE_MID = b"|encrypted by "   # 14 bytes
# message = ch_bytes + TEMPLATE_MID + keyhex(32)
# for codepoint of k utf8 bytes: length L = k + 14 + 32 = k+46

# column layout
KH0 = 0          # keyhex bits 0..255  (byte i bit j -> 8*i+j, j=0 is MSB)
KS = {1:256, 2:384, 3:512, 4:640}
SCOL = 768
NCOL = 896

def blockbit(byteoff, bit):  # position within a 16-byte block, 0=MSB overall
    return 8*byteoff + bit

def build_obs_rows(H, length, chbytes, want_rows):
    """Return list of (mask over NCOL unknowns, const_bit) for each observed tag bit.
    want_rows: list of block-bit positions r (0..127) we observe.
    const_bit = the constant contribution to tag bit r (from known template/L block).
    Equation: XOR(unknown cols in mask) = observed_bit_r XOR const_bit.
    """
    n = (length + 15)//16          # number of data blocks
    powers = [n+1-b for b in range(n)]   # block b (0-idx) -> H power
    Mpow = {}
    for p in set(powers)|{1}:
        Mpow[p] = G.mult_matrix(G.gf_pow(H, p))
    # precompute matrix for S (H^0 = identity): tag bit r gets S bit r directly
    # Build per-tag-bit accumulators
    rows = [0]*128        # mask over NCOL unknowns
    const = [0]*128       # const bit per tag output bit
    # plaintext layout
    kh_start = len(chbytes) + len(TEMPLATE_MID)   # = length-32
    # known const plaintext bytes: chbytes at [0..], TEMPLATE_MID after, keyhex unknown, pad zero
    def contribute_block(bidx, p):
        # block bidx (0-indexed) covers plaintext bytes [16*bidx, 16*bidx+16)
        base = 16*bidx
        blen = min(16, length - base)   # real bytes in this block (rest are pad=0, not in ciphertext)
        M = Mpow[p]
        for off in range(blen):
            pos = base+off
            # determine source of this plaintext byte
            if pos < len(chbytes):
                src = ('const', chbytes[pos])
            elif pos < kh_start:
                src = ('const', TEMPLATE_MID[pos-len(chbytes)])
            else:
                khidx = pos - kh_start
                if khidx < 32:
                    src = ('kh', khidx)
                else:
                    src = ('const', 0)  # shouldn't happen
            q0 = blockbit(off,0)
            for bit in range(8):
                q = q0+bit
                # C byte = P byte XOR KS byte. Contribution of this bit to tag = via M column q.
                # For every output row r where M[r] has bit q, add this unknown/const.
                if src[0]=='kh':
                    col = KH0 + 8*src[1] + bit
                    for r in range(128):
                        if (M[r]>>(127-q))&1:
                            rows[r] ^= (1<<(NCOL-1-col))
                else:
                    val_bit = (src[1]>>(7-bit))&1
                    if val_bit:
                        for r in range(128):
                            if (M[r]>>(127-q))&1:
                                const[r] ^= 1
                # KS bit (always unknown) at this position
                kscol = KS[bidx+1] + blockbit(off,bit)   # KS block index = bidx+1
                for r in range(128):
                    if (M[r]>>(127-q))&1:
                        rows[r] ^= (1<<(NCOL-1-kscol))
    for bidx in range(n):
        contribute_block(bidx, powers[bidx])
    # L (length) block, power 1, all const
    Lblk = (0).to_bytes(8,'big') + (length*8).to_bytes(8,'big')
    M1 = Mpow[1]
    for off in range(16):
        for bit in range(8):
            vb = (Lblk[off]>>(7-bit))&1
            if vb:
                q = blockbit(off,bit)
                for r in range(128):
                    if (M1[r]>>(127-q))&1:
                        const[r]^=1
    # S contributes identity: tag bit r gets S col (768+r)
    for r in range(128):
        rows[r] ^= (1<<(NCOL-1-(SCOL+r)))
    out=[]
    for r in want_rows:
        out.append((rows[r], const[r]))
    return out

def hex_linear_rows():
    """3 linear constraints per keyhex byte: bit0(MSB,=bit7 of value? ) ...
    valid hex char byte in {0x30-0x39,0x61-0x66}: value bits v7..v0 (v7 MSB).
    v7=0 ; v5=1 ; v4 xor v6 =1.  (derived earlier)
    Our column bit j (j=0 MSB) corresponds to value bit (7-j)... wait: byte i bit j, j=0 is MSB=v7.
    So v7 -> bit j=0 ; v6->j=1 ; v5->j=2 ; v4->j=3.
    Constraints: v7=0 -> col(8i+0)=0 ; v5=1 -> col(8i+2)=1 ; v4^v6=1 -> col(8i+3)^col(8i+1)=1.
    """
    rows=[]
    for i in range(32):
        # v7=0
        rows.append((1<<(NCOL-1-(8*i+0)), 0))
        # v5=1
        rows.append((1<<(NCOL-1-(8*i+2)), 1))
        # v4 ^ v6 =1  -> bits j=3 and j=1
        rows.append(((1<<(NCOL-1-(8*i+3)))|(1<<(NCOL-1-(8*i+1))), 1))
    return rows

def gf_rank_nullproj(rows_rhs, ncol, proj_cols):
    """rows_rhs: list of (mask, rhs). mask has bit (ncol-1-col) for column `col`.
    Row-reduce to RREF (pivot per column). Return (rank, nullity, incons, proj_dim).
    proj_dim = dim of null-space of the homogeneous system projected onto proj_cols."""
    # pack: value = (mask << 1) | rhs ; column col occupies bit (ncol-col) ; rhs bit 0
    piv_by_col = {}     # col -> reduced row (packed)
    for (m, rr) in rows_rhs:
        cur = (m << 1) | rr
        while cur >> 1:                 # while mask part nonzero
            hb = (cur >> 1).bit_length() - 1     # highest set mask bit index (0-based within mask)
            col = ncol - 1 - hb
            if col in piv_by_col:
                cur ^= piv_by_col[col]
            else:
                piv_by_col[col] = cur
                break
        else:
            if cur & 1:                 # 0 == 1  -> inconsistent
                return (len(piv_by_col), ncol-len(piv_by_col), True, -1)
    rank = len(piv_by_col)
    pivot_cols = set(piv_by_col.keys())
    free_cols = [c for c in range(ncol) if c not in pivot_cols]
    nullity = len(free_cols)
    # homogeneous null-space basis: one vector per free col
    projset = list(proj_cols)
    projidx = {c:k for k,c in enumerate(projset)}
    proj_vecs = []
    pivcols_desc = sorted(piv_by_col.keys(), reverse=True)   # back-substitution order
    for f in free_cols:
        assign = {f: 1}
        # pivot col value = XOR of the other columns in its row that are assigned 1
        for c in pivcols_desc:
            packed = piv_by_col[c]
            m = packed >> 1
            s = 0
            # iterate set bits of m except the pivot col bit
            mm = m
            while mm:
                lb = mm & (-mm); mm ^= lb
                bitidx = lb.bit_length()-1
                colx = ncol-1-bitidx
                if colx == c:      # pivot's own column
                    continue
                if assign.get(colx, 0):
                    s ^= 1
            assign[c] = s
        pv = 0
        for c, v in assign.items():
            if v and c in projidx:
                pv |= (1 << projidx[c])
        proj_vecs.append(pv)
    # rank of projected vectors
    pivbits = []
    for v in proj_vecs:
        cur = v
        for pb in pivbits:
            if cur ^ pb < cur: cur ^= pb
        if cur: pivbits.append(cur)
    return rank, nullity, False, len(pivbits)

def solve_keyhex_affine(rows_rhs, ncol, proj_n=256):
    """Return (particular[list of proj_n bits as int], nullbasis[list of ints over proj_n],
    consistent). Particular solution's keyhex part + null-space basis projected to keyhex.
    Bit k of returned ints = keyhex column k (k=0..proj_n-1)."""
    piv_by_col = {}
    for (m, rr) in rows_rhs:
        cur = (m << 1) | rr
        while cur >> 1:
            hb = (cur >> 1).bit_length() - 1
            col = ncol - 1 - hb
            if col in piv_by_col:
                cur ^= piv_by_col[col]
            else:
                piv_by_col[col] = cur
                break
        else:
            if cur & 1:
                return None, None, False
    pivot_cols = set(piv_by_col.keys())
    free_cols = [c for c in range(ncol) if c not in pivot_cols]
    pivcols_desc = sorted(piv_by_col.keys(), reverse=True)
    # particular solution: set all free cols = 0, solve pivots (rhs matters)
    assignP = {c:0 for c in free_cols}
    for c in pivcols_desc:
        packed = piv_by_col[c]; m = packed >> 1; rhs = packed & 1
        s = rhs
        mm = m
        while mm:
            lb = mm & (-mm); mm ^= lb
            colx = ncol-1-(lb.bit_length()-1)
            if colx==c: continue
            if assignP.get(colx,0): s ^= 1
        assignP[c] = s
    part = 0
    for c in range(proj_n):
        if assignP.get(c,0): part |= (1<<c)
    # null basis (homogeneous), projected to keyhex, then reduced to independent set
    raw=[]
    for f in free_cols:
        assign={f:1}
        for c in pivcols_desc:
            packed=piv_by_col[c]; m=packed>>1
            s=0; mm=m
            while mm:
                lb=mm&(-mm); mm^=lb
                colx=ncol-1-(lb.bit_length()-1)
                if colx==c: continue
                if assign.get(colx,0): s^=1
            assign[c]=s
        pv=0
        for c in range(proj_n):
            if assign.get(c,0): pv|=(1<<c)
        if pv: raw.append(pv)
    # reduce to independent basis
    basis=[]
    for v in raw:
        cur=v
        for b in basis:
            if (cur ^ b) < cur: cur ^= b
        if cur: basis.append(cur)
    return part, basis, True

def main():
    key=os.urandom(16); nonce=os.urandom(16)
    E,H,J0=G.gcm_HJ0(key,nonce)
    keyhex=key.hex().encode()
    # choose chars for 4 lengths: 1,2,3,4 byte utf8
    chs=[("A".encode(),47),("À".encode(),48),("ࠀ".encode(),49),("\U00010000".encode(),50)]
    for cb,L in chs: assert len(cb)+46==L,(len(cb),L)
    def real_tag(cb):
        c=AES.new(key,AES.MODE_GCM,nonce=nonce)
        c.encrypt(cb+TEMPLATE_MID+keyhex)
        return c.digest()
    tags={L:real_tag(cb) for cb,L in chs}
    highrows=[8*b+j for b in range(16) for j in range(4)]
    allrows=list(range(128))
    def run(want_rows, label):
        rows_rhs=[]
        for cb,L in chs:
            obs=build_obs_rows(H,L,cb,want_rows)
            tag=tags[L]
            for k,r in enumerate(want_rows):
                mask,cst=obs[k]
                obit=(tag[r//8]>>(7-(r%8)))&1
                rows_rhs.append((mask, obit^cst))
        # add hex-linear
        rows_rhs += hex_linear_rows()
        rank,nul,incons,projdim=gf_rank_nullproj(rows_rhs,NCOL,set(range(256)))
        print(f"[{label}] eqs={len(rows_rhs)} rank={rank} incons={incons} keyhex_residual_dim={projdim} (2^{projdim})")
    run(allrows,"FULL tags")
    run(highrows,"HIGH nibbles")

VALID=set(range(0x30,0x3a))|set(range(0x61,0x67))
def kh_bytes(v256):
    out=bytearray(32)
    for i in range(32):
        b=0
        for j in range(8):
            if (v256>>(8*i+j))&1: b|=(1<<(7-j))
        out[i]=b
    return bytes(out)
def valid_hex(bs):
    return all(x in VALID for x in bs)

def measure_counts():
    import random
    key=os.urandom(16); nonce=os.urandom(16)
    E,H,J0=G.gcm_HJ0(key,nonce); keyhex=key.hex().encode()
    chs=[("A".encode(),47),("À".encode(),48),("ࠀ".encode(),49),("\U00010000".encode(),50)]
    def real_tag(cb):
        c=AES.new(key,AES.MODE_GCM,nonce=nonce); c.encrypt(cb+TEMPLATE_MID+keyhex); return c.digest()
    tags={L:real_tag(cb) for cb,L in chs}
    def build(want_rows):
        rr=[]
        for cb,L in chs:
            obs=build_obs_rows(H,L,cb,want_rows); tag=tags[L]
            for k,r in enumerate(want_rows):
                mask,cst=obs[k]; obit=(tag[r//8]>>(7-(r%8)))&1
                rr.append((mask,obit^cst))
        rr+=hex_linear_rows(); return rr
    highrows=[8*b+j for b in range(16) for j in range(4)]
    allrows=list(range(128))
    # FULL: enumerate
    part,basis,ok=solve_keyhex_affine(build(allrows),NCOL)
    print("FULL dim",len(basis),"consistent",ok,"true in space?",end=" ")
    truev=int.from_bytes(bytes(reversed(kh_bits_from(keyhex))),'little') if False else kh_int(keyhex)
    print(check_in(part,basis,truev))
    d=len(basis); validc=0; aeswin=None
    for mask in range(1<<d):
        v=part
        for b in range(d):
            if (mask>>b)&1: v^=basis[b]
        bs=kh_bytes(v)
        if valid_hex(bs):
            validc+=1
            kk=bytes.fromhex(bs.decode())
            if G.b2i(AES.new(kk,AES.MODE_ECB).encrypt(b'\0'*16))==H:
                aeswin=bs
    print(f"FULL valid-hex count={validc}, AES-unique win={'YES '+aeswin.decode() if aeswin else 'NO'}, true={keyhex.decode()}")
    # HIGH: sample
    part,basis,ok=solve_keyhex_affine(build(highrows),NCOL)
    d=len(basis)
    print("HIGH dim",d,"true in space?",check_in(part,basis,kh_int(keyhex)))
    N=200000; hit=0
    for _ in range(N):
        v=part
        for b in range(d):
            if random.getrandbits(1): v^=basis[b]
        if valid_hex(kh_bytes(v)): hit+=1
    import math
    frac=hit/N
    print(f"HIGH valid-hex sample: {hit}/{N} frac={frac:.3e} -> est count ~2^{math.log2(frac)+d:.1f}" if hit else f"HIGH valid rate <{1/N:.1e}; est <2^{math.log2(1/N)+d:.1f}")

def kh_int(keyhex):  # keyhex bytes -> 256-bit int (bit 8i+j = byte i bit j, j=0 MSB)
    v=0
    for i in range(32):
        for j in range(8):
            if (keyhex[i]>>(7-j))&1: v|=(1<<(8*i+j))
    return v
def kh_bits_from(keyhex): return keyhex
def check_in(part,basis,target):
    # is target in affine space part+span(basis)?
    d=part^target
    for b in basis:
        if (d^b)<d: d^=b
    return d==0

if __name__=="__main__":
    import sys
    if len(sys.argv)>1 and sys.argv[1]=="count":
        measure_counts()
    else:
        main()
