"""Nonce recovery given the KEY. Build full-tag linear system with keyhex fixed (known),
unknowns = KS1..4,S. Solve for S affine space, brute residual, recover J0=E_K^-1(S) -> nonce, verify."""
import os, numpy as np, time
import gcmlib as G
from Crypto.Cipher import AES
import clean_measure as CM

def build_S_space(key, H, obs_full):
    """obs_full: list of (length, chbytes, full_tag_bytes16). keyhex known from key.
    Return (part,basis) for S (128-bit int, bit x = col 768+x)."""
    keyhex=key.hex().encode()
    want=list(range(128))
    rr=[]
    for (L,cb,tag) in obs_full:
        obsrows=CM.build_obs_rows(H,L,cb,want)
        for k,r in enumerate(want):
            mask,cst=obsrows[k]
            obit=(tag[r//8]>>(7-(r%8)))&1
            rr.append((mask,obit^cst))
    # fix keyhex bits (cols 0..255) to known values
    for i in range(32):
        for j in range(8):
            col=8*i+j
            bit=(keyhex[i]>>(7-j))&1
            rr.append((1<<(CM.NCOL-1-col), bit))
    # solve, project to S cols 768..895
    part,basis,ok=CM.solve_keyhex_affine_range(rr,CM.NCOL,768,896) if hasattr(CM,'solve_keyhex_affine_range') else _solveproj(rr,768,896)
    return part,basis,ok

def _solveproj(rows_rhs, lo, hi):
    # generic affine solve projecting onto columns [lo,hi)
    ncol=CM.NCOL
    piv_by_col={}
    for (m,rr) in rows_rhs:
        cur=(m<<1)|rr
        while cur>>1:
            hb=(cur>>1).bit_length()-1; col=ncol-1-hb
            if col in piv_by_col: cur^=piv_by_col[col]
            else: piv_by_col[col]=cur; break
        else:
            if cur&1: return None,None,False
    pivcols=set(piv_by_col); free=[c for c in range(ncol) if c not in pivcols]
    desc=sorted(piv_by_col,reverse=True)
    def assign_from(seed):
        assign=dict(seed)
        for c in desc:
            packed=piv_by_col[c]; m=packed>>1; rhs=packed&1; s=rhs; mm=m
            while mm:
                lb=mm&(-mm); mm^=lb; colx=ncol-1-(lb.bit_length()-1)
                if colx==c: continue
                if assign.get(colx,0): s^=1
            assign[c]=s
        return assign
    # particular: all free=0. col (lo+r) is block-bit r (MSB-first) -> integer bit 127-r = hi-1-c
    ap=assign_from({c:0 for c in free})
    part=0
    for c in range(lo,hi):
        if ap.get(c,0): part|=(1<<(hi-1-c))
    # basis: each free col
    raw=[]
    for f in free:
        a=assign_from({f:1, **{g:0 for g in free if g!=f}})
        v=0
        for c in range(lo,hi):
            if a.get(c,0): v|=(1<<(hi-1-c))
        if v: raw.append(v)
    basis=[]
    for v in raw:
        cur=v
        for b in basis:
            if (cur^b)<cur: cur^=b
        if cur: basis.append(cur)
    return part,basis,True

def recover_nonce(key, H, obs_full, verbose=True):
    t0=time.time()
    part,basis,ok=build_S_space(key,H,obs_full)
    if not ok:
        if verbose: print("nonce system inconsistent"); return None
    d=len(basis)
    if verbose: print(f"S residual dim = {d} (2^{d}), setup {time.time()-t0:.1f}s")
    Einv=AES.new(key,AES.MODE_ECB)
    Bblk=(0).to_bytes(8,'big')+(128).to_bytes(8,'big')  # length block for 16-byte nonce
    BH=G.gf_mul(G.b2i(Bblk),H)
    Hinv2=G.gf_inv(G.gf_mul(H,H))
    # verification message
    L0,cb0,tag0=obs_full[0]
    keyhex=key.hex().encode()
    pt0=cb0+CM.TEMPLATE_MID+keyhex
    for mask in range(1<<d):
        S=part
        m=mask; bi=0
        while m:
            if m&1: S^=basis[bi]
            m>>=1; bi+=1
        J0=G.b2i(Einv.decrypt(G.i2b(S)))
        nonce=G.i2b(G.gf_mul(J0^BH, Hinv2))
        # verify
        c=AES.new(key,AES.MODE_GCM,nonce=nonce); c.encrypt(pt0)
        if c.digest()==tag0:
            if verbose: print(f"nonce found (mask={mask}) total {time.time()-t0:.1f}s")
            return nonce
    if verbose: print("nonce not found in residual!")
    return None

if __name__=="__main__":
    key=os.urandom(16); nonce=os.urandom(16)
    E,H,J0=G.gcm_HJ0(key,nonce)
    obs=[]
    for ch,L in [("3",47),("À",48),("ࠀ",49),("\U00010000",50)]:
        cb=ch.encode()
        c=AES.new(key,AES.MODE_GCM,nonce=nonce); c.encrypt(cb+CM.TEMPLATE_MID+key.hex().encode())
        obs.append((L,cb,c.digest()))
    rec=recover_nonce(key,H,obs)
    print("nonce match:", rec==nonce, rec.hex() if rec else None, "true", nonce.hex())
