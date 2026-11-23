"""Clean MITM key recovery from high-nibble affine space (clean_measure).
Reparametrize keyhex so bytes 23-31 (+3 bits of byte22) are the 48 free coordinates,
then meet-in-the-middle over valid-hex assignments, filtering by AES(key,0)==H.
"""
import os, numpy as np, time
import gcmlib as G
from Crypto.Cipher import AES
import clean_measure as CM

VALID = list(range(0x30,0x3a))+list(range(0x61,0x67))   # 16 valid ascii hex bytes
# meaningful bit columns within a byte (j indices), j=0 MSB
MEAN_J = [1,4,5,6,7]     # v6,v3,v2,v1,v0

def colvecs(part, basis):
    """Return (part bits access, colvec[x] 48-bit = dependence of column x on free bits)."""
    d=len(basis)
    colvec=[0]*256
    for x in range(256):
        v=0
        for j in range(d):
            if (basis[j]>>x)&1: v|=(1<<j)
        colvec[x]=v
    partbit=[(part>>x)&1 for x in range(256)]
    return colvec, partbit, d

def gf_solve_basis(rows):
    """rows: list of (d-bit vec). Return chosen independent subset indices building rank; used for greedy."""
    pass

def choose_free_columns(colvec, d):
    """Greedy: pick 48 independent columns, preferring bytes 31..23 meaningful bits, then byte22, then rest."""
    order=[]
    for b in list(range(31,22,-1)):          # bytes 31..23
        for j in MEAN_J: order.append(8*b+j)
    for j in MEAN_J: order.append(8*22+j)     # byte22 meaningful
    for b in list(range(21,-1,-1)):           # remaining bytes 21..0
        for j in MEAN_J: order.append(8*b+j)
    # also allow the "fixed" bits just in case
    chosen=[]; basisind=[]
    for c in order:
        v=colvec[c]
        cur=v
        for bpiv in basisind:
            if (cur ^ bpiv) < cur: cur^=bpiv
        if cur:
            basisind.append(cur); chosen.append(c)
            if len(chosen)==d: break
    assert len(chosen)==d, f"only {len(chosen)} independent"
    return chosen

def gf_matinv(mat, n):
    """mat: list of n ints (n-bit rows). Return inverse as list of n ints, or None."""
    aug=[(mat[i]<<n)|(1<<(n-1-i)) for i in range(n)]
    row=0
    for col in range(n):
        bit=(2*n-1-col)
        piv=None
        for r in range(row,n):
            if (aug[r]>>bit)&1: piv=r;break
        if piv is None: return None
        aug[row],aug[piv]=aug[piv],aug[row]
        for r in range(n):
            if r!=row and (aug[r]>>bit)&1: aug[r]^=aug[row]
        row+=1
    inv=[aug[i]&((1<<n)-1) for i in range(n)]
    return inv

def build_reparam(part, basis):
    colvec, partbit, d = colvecs(part, basis)
    chosen = choose_free_columns(colvec, d)
    # Mat rows = colvec[c] for c in chosen (d-bit). free bit j is bit j (LSB..). Represent as d-bit with bit j.
    # We need Mat as d x d over the free-bit space. Row i = colvec[chosen[i]] (bits 0..d-1).
    # Represent row as int with bit (d-1-j) for free bit j so matinv's MSB-first works.
    def toMSB(v):
        out=0
        for j in range(d):
            if (v>>j)&1: out|=(1<<(d-1-j))
        return out
    Mat=[toMSB(colvec[chosen[i]]) for i in range(d)]
    Minv=gf_matinv(Mat,d)
    assert Minv is not None
    # For column x: w_x = colvec_x * Minv  (a d-bit vector over the "chosen" index space)
    # keyhex_x = const_x ⊕ w_x · Y  where Y_i = value at chosen[i].
    # colvec_x in MSB form:
    def wvec(x):
        cx=toMSB(colvec[x])
        # w = cx * Minv : bit k of w = parity( cx & Minv_col_k ). Minv rows are Minv[i];
        # (cx * Minv)_k = XOR_i cx_i * Minv[i]_k. cx_i is bit (d-1-i) of cx.
        w=0
        for i in range(d):
            if (cx>>(d-1-i))&1:
                w^=Minv[i]
        return w   # MSB form over chosen index (bit d-1-k for chosen k)
    # const_x = part_x ⊕ (w_x · P_C) where P_C_i = partbit[chosen[i]]
    PC=0
    for i in range(d):
        if partbit[chosen[i]]: PC|=(1<<(d-1-i))
    W=[wvec(x) for x in range(256)]
    constx=[0]*256
    for x in range(256):
        constx[x]=partbit[x]^ (1 if bin(W[x]&PC).count('1')&1 else 0)
    return chosen, W, constx, d

def y_index_map(chosen, d):
    """Map (byte,j)->chosen index i (bit position d-1-i in Y)."""
    m={}
    for i,c in enumerate(chosen):
        m[(c//8, c%8)]=i
    return m

def ascii_to_Ybits(b, val, ymap, d):
    """Given byte index b and ascii value val, return the Y bits (as int, MSB form) it sets among chosen coords,
    and mask of which chosen coords belong to this byte's meaningful bits."""
    ybits=0; ymask=0
    for j in MEAN_J:
        if (b,j) in ymap:
            i=ymap[(b,j)]
            bit=(val>>(7-j))&1
            if bit: ybits|=(1<<(d-1-i))
            ymask|=(1<<(d-1-i))
    return ybits, ymask

def reconstruct_keyhex(Y, W, constx, d):
    """Y: MSB-form int over chosen coords. Return 32-byte keyhex ascii."""
    out=bytearray(32)
    for x in range(256):
        bit = constx[x] ^ (1 if bin(W[x]&Y).count('1')&1 else 0)
        if bit:
            i=x//8; j=x%8
            out[i]|=(1<<(7-j))
    return bytes(out)

# ---- self-test: reconstruction reproduces true key ----
def selftest():
    key=os.urandom(16); nonce=os.urandom(16)
    E,H,J0=G.gcm_HJ0(key,nonce); keyhex=key.hex().encode()
    chs=[("A".encode(),47),("À".encode(),48),("ࠀ".encode(),49),("\U00010000".encode(),50)]
    def real_tag(cb):
        c=AES.new(key,AES.MODE_GCM,nonce=nonce); c.encrypt(cb+CM.TEMPLATE_MID+keyhex); return c.digest()
    tags={L:real_tag(cb) for cb,L in chs}
    want=[8*b+j for b in range(16) for j in range(4)]
    rr=[]
    for cb,L in chs:
        obs=CM.build_obs_rows(H,L,cb,want); tag=tags[L]
        for k,r in enumerate(want):
            mask,cst=obs[k]; obit=(tag[r//8]>>(7-(r%8)))&1
            rr.append((mask,obit^cst))
    rr+=CM.hex_linear_rows()
    part,basis,ok=CM.solve_keyhex_affine(rr,CM.NCOL)
    chosen,W,constx,d=build_reparam(part,basis)
    ymap=y_index_map(chosen,d)
    # build true Y from keyhex
    Ytrue=0
    for i,c in enumerate(chosen):
        b=c//8;j=c%8
        bit=(keyhex[b]>>(7-j))&1
        if bit: Ytrue|=(1<<(d-1-i))
    rec=reconstruct_keyhex(Ytrue,W,constx,d)
    print("reconstruct==true:", rec==keyhex, rec.decode(), keyhex.decode())
    # check bytes 23-31 fully free
    freebytes=[b for b in range(32) if all((b,j) in ymap for j in MEAN_J)]
    print("fully-free bytes:", freebytes)
    return part,basis,chosen,W,constx,d,H,keyhex,ymap

if __name__=="__main__":
    selftest()
