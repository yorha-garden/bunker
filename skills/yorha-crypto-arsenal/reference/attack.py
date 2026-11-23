import os, random
from Crypto.Cipher import AES
import gcmlib as G

# ---------- H recovery ----------
HN=G.high_nibble_rows()
def hnvec(hh):
    out=0
    for b in range(16):
        nib=int(hh[b],16)
        for j in range(4): out=(out<<1)|((nib>>(3-j))&1)
    return out
def highnib_of(val):
    out=0
    for b in range(16):
        for j in range(4): out=(out<<1)|((val>>(127-(8*b+j)))&1)
    return out
def gauss(rows,rhs,nv,prefer=()):
    aug=[[rows[i],rhs[i]] for i in range(len(rows))];piv=[];pivset=set()
    cols=list(prefer)+[c for c in range(nv) if c not in prefer]
    for col in cols:
        cm=1<<(nv-1-col);pi=-1
        for i in range(len(aug)):
            if i not in pivset and (aug[i][0]&cm):pi=i;break
        if pi<0:continue
        pm,pb=aug[pi]
        for i in range(len(aug)):
            if i!=pi and (aug[i][0]&cm):aug[i][0]^=pm;aug[i][1]^=pb
        piv.append((col,pi));pivset.add(pi)
    for a in aug:
        if a[0]==0 and a[1]==1:return None
    return aug,piv,{c for c,_ in piv}
def recover_H(H47,chars47):
    o=[hnvec(h) for h in H47];rows=[];rhs=[]
    for k in range(1,len(chars47)):
        dc=chars47[0][0]^chars47[k][0]
        Am=G.matmul_rows(HN,G.mult_matrix(dc<<120));od=o[0]^o[k]
        for r in range(64): rows.append(Am[r]);rhs.append((od>>(63-r))&1)
    g=gauss(rows,rhs,128)
    if not g: return None
    aug,piv,pc=g
    if len(piv)<128: return None
    x=0
    for col,pi in piv:
        pm,pb=aug[pi];s=pb^(bin((pm&~(1<<(127-col)))&x).count("1")&1)
        if s:x|=(1<<(127-col))
    return G.gf_pow(x,pow(4,-1,G.ORDER))

# ---------- E_A/E_B linear maps ----------
NVfull=896; OFFS={'ks1':256,'ks2':384,'ks3':512,'ks4':640,'s':768}
def tag_lin(H,length,lead):
    nb=(length+15)//16;masks=[0]*128;kh0=lead+14
    for i in range(nb):
        Hp=G.gf_pow(H,nb+1-i);cols=[G.gf_mul(Hp,1<<(127-t)) for t in range(128)]
        b0=16*i;b1=min(16*i+16,length);dl=b1-b0;ko=OFFS[f'ks{i+1}']
        for bit in range(dl*8):
            ci=cols[bit]
            for r in range(128):
                if (ci>>(127-r))&1:masks[r]^=(1<<(NVfull-1-(ko+bit)))
        for k in range(32):
            pos=kh0+k
            if b0<=pos<b1:
                w=pos-b0
                for jb in range(8):
                    ci=cols[w*8+jb]
                    for r in range(128):
                        if (ci>>(127-r))&1:masks[r]^=(1<<(NVfull-1-(k*8+jb)))
    for r in range(128):masks[r]^=(1<<(NVfull-1-(OFFS['s']+r)))
    return masks
def cplain(H,length,lead,prefix):
    known=bytearray(length);kb=prefix+b"|encrypted by "
    for i,b in enumerate(kb):known[i]=b
    nb=(length+15)//16;val=0
    for i in range(nb):
        Hp=G.gf_pow(H,nb+1-i);b0=16*i;b1=min(16*i+16,length)
        blk=bytes(known[b0:b1])+b'\x00'*(16-(b1-b0));val^=G.gf_mul(G.b2i(blk),Hp)
    L=(0).to_bytes(8,'big')+(length*8).to_bytes(8,'big');val^=G.gf_mul(G.b2i(L),H)
    return val

def build_key_system(H, EA_pair, EB_pair):
    NV=272
    def red(m):
        o2=0
        for bit in range(256):
            if (m>>(NVfull-1-bit))&1:o2|=(1<<(NV-1-bit))
        for j in range(8):
            if (m>>(NVfull-1-(512+120+j)))&1:o2|=(1<<(NV-1-(256+j)))
        for j in range(8):
            if (m>>(NVfull-1-(640+8+j)))&1:o2|=(1<<(NV-1-(264+j)))
        return o2
    (la,lda,pa,ta),(lb,ldb,pb,tb)=EA_pair
    EAm=[tag_lin(H,la,lda)[r]^tag_lin(H,lb,ldb)[r] for r in range(128)]
    cA=cplain(H,la,lda,pa)^cplain(H,lb,ldb,pb)
    obsEA=hnvec(ta)^hnvec(tb)^highnib_of(cA)
    (lc,ldc,pc,tc),(ld,ldd,pd,td)=EB_pair
    EBm=[tag_lin(H,lc,ldc)[r]^tag_lin(H,ld,ldd)[r] for r in range(128)]
    cB=cplain(H,lc,ldc,pc)^cplain(H,ld,ldd,pd)
    obsEB=hnvec(tc)^hnvec(td)^highnib_of(cB)
    EAr=[red(m) for m in EAm];EBr=[red(m) for m in EBm]
    hbits=[8*b+j for b in range(16) for j in range(4)]
    rows=[];rhs=[]
    for idx,tbi in enumerate(hbits):rows.append(EAr[tbi]);rhs.append((obsEA>>(63-idx))&1)
    for idx,tbi in enumerate(hbits):rows.append(EBr[tbi]);rhs.append((obsEB>>(63-idx))&1)
    return rows,rhs,NV

if __name__=="__main__":
    key=os.urandom(16);nonce=os.urandom(16);keyhex=key.hex()
    E,Ht,J0=G.gcm_HJ0(key,nonce)
    def hi(prefix):
        pt=prefix+b"|encrypted by "+keyhex.encode()
        c=AES.new(key,AES.MODE_GCM,nonce=nonce);c.encrypt(pt);return c.digest().hex()[0::2]
    c47=[b'3',b'G',b'U'];p48="À".encode();p49="ࠀ".encode();p50="𐀀".encode()
    H47=[hi(c) for c in c47];H48=hi(p48);H49=hi(p49);H50=hi(p50)
    H=recover_H(H47,c47);print("H ok:",H==Ht)
    rows,rhs,NV=build_key_system(H,((47,1,c47[0],H47[0]),(48,2,p48,H48)),((49,3,p49,H49),(50,4,p50,H50)))
    # add hex-linear
    for k in range(32):
        base=k*8
        rows.append(1<<(NV-1-(base+0)));rhs.append(0)
        rows.append(1<<(NV-1-(base+2)));rhs.append(1)
        rows.append((1<<(NV-1-(base+3)))|(1<<(NV-1-(base+1))));rhs.append(1)
    g=gauss(rows,rhs,NV);aug,piv,pc=g
    free=[c for c in range(NV) if c not in pc];nf=len(free)
    fidx={c:i for i,c in enumerate(free)};vconst=[0]*NV;vmask=[0]*NV
    for c in free:vmask[c]=1<<(nf-1-fidx[c])
    for col,pi in piv:
        pm,pb=aug[pi];const=pb;mask=0;others=pm&~(1<<(NV-1-col));c2=others
        while c2:
            b=c2&(-c2);c2^=b;pos=(NV-1)-(b.bit_length()-1);const^=vconst[pos];mask^=vmask[pos]
        vconst[col]=const;vmask[col]=mask
    def kh_from_free(fv):
        kb=bytearray(32)
        for k in range(32):
            by=0
            for jb in range(8):
                col=k*8+jb;by=(by<<1)|(vconst[col]^(bin(vmask[col]&fv).count("1")&1))
            kb[k]=by
        return bytes(kb)
    VALID=set(list(range(0x30,0x3a))+list(range(0x61,0x67)))
    N=200000;cnt=0
    for _ in range(N):
        fv=random.getrandbits(nf)
        kb=kh_from_free(fv)
        if all(b in VALID for b in kb):cnt+=1
    frac=cnt/N;est=frac*(2**nf)
    print(f"free={nf}, valid frac {cnt}/{N}, est count ~ 2^{(est.bit_length()-1) if est>=1 else -1} ({est:.2e})")

# ---------- Key recovery via info-set MITM ----------
VALIDB = bytes(sorted(list(range(0x30,0x3a))+list(range(0x61,0x67))))
VALIDSET = set(VALIDB)

def solve_gf2_full(rows, rhs, nv, prefer=()):
    return gauss(rows, rhs, nv, prefer)

def recover_key_full(H, EA_pair, EB_pair, Htarget_bytes):
    """Returns keyhex bytes (32) or None. Htarget_bytes = i2b(H) for the E_K(0)=H check."""
    rows,rhs,NV = build_key_system(H, EA_pair, EB_pair)
    for k in range(32):
        base=k*8
        rows.append(1<<(NV-1-(base+0)));rhs.append(0)
        rows.append(1<<(NV-1-(base+2)));rhs.append(1)
        rows.append((1<<(NV-1-(base+3)))|(1<<(NV-1-(base+1))));rhs.append(1)
    prefer=list(range(256,272))  # pivot contam
    g=gauss(rows,rhs,NV,prefer=prefer)
    if not g: return None
    aug,piv,pc=g
    free=[c for c in range(NV) if c not in pc]; nf=len(free)
    fidx={c:i for i,c in enumerate(free)}; vconst=[0]*NV; vmask=[0]*NV
    for c in free: vmask[c]=1<<(nf-1-fidx[c])
    for col,pi in piv:
        pm,pb=aug[pi]; const=pb; mask=0; c2=pm&~(1<<(NV-1-col))
        while c2:
            b=c2&(-c2);c2^=b;pos=(NV-1)-(b.bit_length()-1); const^=vconst[pos]; mask^=vmask[pos]
        vconst[col]=const; vmask[col]=mask
    # each keyhex bit col in 0..255 -> (const bit, mask over nf free)
    bitconst=[vconst[c] for c in range(256)]
    bitmask=[vmask[c] for c in range(256)]
    # choose info set: 6 keyhex bytes whose 48 bits are invertible wrt free (nf must be 48)
    if nf!=48: 
        # fall back: use nf-sized info set (nf/8 bytes) - assume 48
        pass
    # build a 48xnf matrix from candidate info bytes, find a set giving rank nf
    import itertools
    # Try to pick 6 bytes; collect their 8 masks each; check the 48 masks span nf dims
    def rank_masks(masks):
        basis=[]
        for m in masks:
            cur=m
            for b in basis:
                if cur^b<cur: cur^=b
            if cur: basis.append(cur); basis.sort(reverse=True)
        return len(basis)
    infoset=None
    # prefer determined bytes 0..20 grouped; try sliding windows / combos
    cand_bytes=list(range(32))
    for combo in itertools.combinations(range(0,12),6):  # try early bytes first
        masks=[]
        for kb in combo:
            for jb in range(8): masks.append(bitmask[kb*8+jb])
        if rank_masks(masks)==nf:
            infoset=list(combo); break
    if infoset is None:
        for combo in itertools.combinations(range(32),6):
            masks=[]
            for kb in combo:
                for jb in range(8): masks.append(bitmask[kb*8+jb])
            if rank_masks(masks)==nf:
                infoset=list(combo); break
    if infoset is None: return None
    otherbytes=[b for b in range(32) if b not in infoset]
    # Build matrix: 48 rows = (const, mask) for info bits. Invert: free = INV*(infobits ^ constvec)
    # We express free bits in terms of info bits. Solve linear system: for target infobyte bits = given, find free.
    # info bit value = bitconst[idx] ^ parity(bitmask[idx] & free). 
    # Let infovec (48 bits) be the info byte bits (MSB-first within our ordering). Then:
    #   infovec_j ^ bitconst[idx_j] = parity(bitmask[idx_j] & free)
    # Build A (48 x nf) rows=bitmask[idx_j]; solve A free = (infovec ^ const) -> free = A^{-1} rhs.
    idxs=[]
    for kb in infoset:
        for jb in range(8): idxs.append(kb*8+jb)
    A=[bitmask[i] for i in idxs]  # 48 rows over nf bits
    cvec=[bitconst[i] for i in idxs]
    # invert A (nf x nf). Build augmented to solve A x = e_i for each -> inverse columns. 
    # We'll solve on the fly: given rhs vector (48 bits), x=free. Precompute A^{-1} as list of masks (free bit -> combination of rhs bits).
    # Gaussian to get free bits as function of rhs bits:
    # rows: A[j] over free-bits (nf); we want free = f(rhs). Solve A x = r.
    Ai=[[A[j], 1<<(nf-1-j)] for j in range(nf)]  # augmented: left=free-mask, right=rhs-indicator (which rhs bit)
    # eliminate to identity on left
    piv2=[]
    for col in range(nf):
        cm=1<<(nf-1-col); pr=-1
        for j in range(nf):
            if Ai[j][0]&cm and all(j!=p for p in piv2): pr=j;break
        if pr<0: return None
        for j in range(nf):
            if j!=pr and (Ai[j][0]&cm): Ai[j][0]^=Ai[pr][0]; Ai[j][1]^=Ai[pr][1]
        piv2.append(pr)
    # now Ai[pr] has left = e_col; its right = combination of rhs bits giving free bit col
    freebit_from_rhs=[0]*nf
    for col in range(nf):
        cm=1<<(nf-1-col)
        for j in range(nf):
            if Ai[j][0]==cm:
                freebit_from_rhs[col]=Ai[j][1]; break
    # Now: given info bytes values -> infovec bits -> rhs = infovec ^ cvec -> free bits -> other bytes.
    # Precompute: other byte bits as function of free -> function of rhs. 
    # Represent free as nf-bit int. rhs is nf-bit int (from info). free bit col = parity(freebit_from_rhs[col] & rhs).
    # We'll just compute per candidate.
    def rhs_from_infobytes(vals):  # vals: dict byte->value
        rhs=0
        for j,idx in enumerate(idxs):
            kb=idx//8; jb=idx%8
            bit=((vals[kb]>>(7-jb))&1) ^ cvec[j]
            rhs=(rhs<<1)|bit
        return rhs
    def free_from_rhs(rhs):
        f=0
        for col in range(nf):
            if bin(freebit_from_rhs[col]&rhs).count("1")&1: f|=(1<<(nf-1-col))
        return f
    def all_bytes_from_free(f):
        kb=bytearray(32)
        for k in range(32):
            by=0
            for jb in range(8):
                idx=k*8+jb
                by=(by<<1)|(bitconst[idx]^(bin(bitmask[idx]&f).count("1")&1))
            kb[k]=by
        return bytes(kb)
    # MITM: split infoset into two triples
    from Crypto.Cipher import AES as _AES
    g1=infoset[:3]; g2=infoset[3:]
    # precompute for each valid assignment of g1 -> free contribution (rhs contribution), similarly g2, then combine
    # rhs is linear in info bits, free linear in rhs -> free linear in info bits. Precompute free contribution per group.
    def free_contrib(group, vals):
        rhs=rhs_from_infobytes({**{b:0 for b in infoset}, **vals})
        return free_from_rhs(rhs)
    # const part (all info bytes 0): 
    base_rhs=rhs_from_infobytes({b:0 for b in infoset})
    base_free=free_from_rhs(base_rhs)
    A1={}
    for combo in itertools.product(VALIDB,repeat=3):
        vals={g1[i]:combo[i] for i in range(3)}
        fr=free_from_rhs(rhs_from_infobytes({**{b:0 for b in infoset},**vals}))
        A1[combo]=fr ^ base_free  # contribution beyond base
    # now enumerate g2, combine
    found=None
    for combo2 in itertools.product(VALIDB,repeat=3):
        vals2={g2[i]:combo2[i] for i in range(3)}
        fr2=free_from_rhs(rhs_from_infobytes({**{b:0 for b in infoset},**vals2})) ^ base_free
        for combo1,fr1 in A1.items():
            f=base_free ^ fr1 ^ fr2
            kb=all_bytes_from_free(f)
            ok=True
            for b in otherbytes:
                if kb[b] not in VALIDSET: ok=False;break
            if not ok: continue
            # valid keyhex candidate; check E_K(0)=H
            try: K=bytes.fromhex(kb.decode())
            except: continue
            if _AES.new(K,_AES.MODE_ECB).encrypt(b'\x00'*16)==Htarget_bytes:
                found=bytes(kb); break
        if found: break
    return found

if __name__ == "__main__" and os.environ.get("TESTKEY"):
    import time
    key=os.urandom(16);nonce=os.urandom(16);keyhex=key.hex()
    E,Ht,J0=G.gcm_HJ0(key,nonce)
    def hi(prefix):
        pt=prefix+b"|encrypted by "+keyhex.encode()
        c=AES.new(key,AES.MODE_GCM,nonce=nonce);c.encrypt(pt);return c.digest().hex()[0::2]
    c47=[b'3',b'G',b'U'];p48="À".encode();p49="ࠀ".encode();p50="𐀀".encode()
    H47=[hi(c) for c in c47];H48=hi(p48);H49=hi(p49);H50=hi(p50)
    H=recover_H(H47,c47);assert H==Ht
    t0=time.time()
    kb=recover_key_full(H,((47,1,c47[0],H47[0]),(48,2,p48,H48)),((49,3,p49,H49),(50,4,p50,H50)), G.i2b(Ht))
    print("recovered:",kb.decode() if kb else None,"time %.1fs"%(time.time()-t0))
    print("true     :",keyhex)
    print("MATCH:", kb and kb.decode()==keyhex)
