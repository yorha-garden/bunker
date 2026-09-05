"""Full high-nibble KEY recovery: build affine space, reparam, build MITM tables, call C, AES-check.
recover_key(H, obs) where obs = dict length-> high-nibble hex string (16 chars) for lengths 47,48,49,50,
and the char bytes used for each length (to build const). Returns keyhex bytes or None."""
import os, numpy as np, time, subprocess, struct
import gcmlib as G
from Crypto.Cipher import AES
import clean_measure as CM, mitm_clean as MC
import attack as A

HERE=os.path.dirname(os.path.abspath(__file__))
MITMBIN=os.path.join(HERE,"mitm")

def popcnt(x): return bin(x).count('1')

def build_affine(H, obs):
    """obs: list of (length, chbytes, highhex16). Build keyhex affine space from high nibbles."""
    want=[8*b+j for b in range(16) for j in range(4)]
    rr=[]
    for (L,cb,hh) in obs:
        omask=A.hnvec(hh)   # 64-bit, bit (63-k) = high nibble bits in order b,j
        obsrows=CM.build_obs_rows(H,L,cb,want)
        for k,r in enumerate(want):
            mask,cst=obsrows[k]
            obit=(omask>>(63-k))&1
            rr.append((mask,obit^cst))
    rr+=CM.hex_linear_rows()
    part,basis,ok=CM.solve_keyhex_affine(rr,CM.NCOL)
    return part,basis,ok

def contrib23(ybits, W):
    out=np.zeros(23,np.uint8)
    for x in range(23):
        b=0
        for j in range(8):
            if popcnt(W[8*x+j]&ybits)&1: b|=(1<<(7-j))
        out[x]=b
    return out

def recover_key(H, obs, verbose=True, tag="run"):
    t0=time.time()
    part,basis,ok=build_affine(H,obs)
    if not ok:
        if verbose: print("inconsistent system");
        return None
    d=len(basis)
    if d!=48 and verbose: print("WARN dim",d)
    chosen,W,constx,d=MC.build_reparam(part,basis)
    ymap=MC.y_index_map(chosen,d)
    freebytes=[b for b in range(32) if all((b,j) in ymap for j in MC.MEAN_J)]
    extra=[c for c in chosen if (c//8) not in freebytes]
    # const bytes 0..22
    constb=np.zeros(23,np.uint8)
    for x in range(23):
        b=0
        for j in range(8):
            if constx[8*x+j]: b|=(1<<(7-j))
        constb[x]=b
    # split freebytes into left/right
    left_bytes=freebytes[:5]; right_bytes=freebytes[5:]
    # per free byte: valid ascii -> (contrib23, ybits)
    def byte_tables(b):
        C=np.zeros((16,23),np.uint8); Y=np.zeros(16,np.uint64)
        for vi,val in enumerate(MC.VALID):
            yb,_=MC.ascii_to_Ybits(b,val,ymap,d)
            C[vi]=contrib23(yb,W); Y[vi]=yb
        return C,Y
    # left combos
    def combine(byte_list, extra_bits):
        Cc=None; Yy=None
        for b in byte_list:
            C,Y=byte_tables(b)
            if Cc is None: Cc=C; Yy=Y
            else:
                Cc=(Cc[:,None,:]^C[None,:,:]).reshape(-1,23)
                Yy=(Yy[:,None]^Y[None,:]).reshape(-1)
        # extra single bits
        for cbit in extra_bits:
            i=ymap[(cbit//8,cbit%8)]; yb=(1<<(d-1-i))
            con=contrib23(yb,W)
            C2=np.stack([np.zeros(23,np.uint8), con]); Y2=np.array([0,yb],np.uint64)
            if Cc is None: Cc=C2;Yy=Y2
            else:
                Cc=(Cc[:,None,:]^C2[None,:,:]).reshape(-1,23)
                Yy=(Yy[:,None]^Y2[None,:]).reshape(-1)
        return Cc,Yy
    tL=time.time()
    Lc,Ly=combine(left_bytes,[])
    Rc,Ry=combine(right_bytes,extra)
    if verbose: print(f"tables L={len(Lc)} R={len(Rc)} build {time.time()-tL:.1f}s (setup {tL-t0:.1f}s)")
    # sort rights by (Rc0,Rc1,Rc2) anchor for cache locality across consecutive rights
    rkey=(Rc[:,0].astype(np.uint32)<<16)|(Rc[:,1].astype(np.uint32)<<8)|Rc[:,2].astype(np.uint32)
    ro=np.argsort(rkey,kind='stable'); Rc=Rc[ro]; Ry=Ry[ro]
    # write binary
    VALID=np.zeros(256,np.uint8)
    for x in MC.VALID: VALID[x]=1
    NL=len(Lc); NR=len(Rc)
    Lc24=np.zeros((NL,24),np.uint8); Lc24[:,:23]=Lc
    Rc24=np.zeros((NR,24),np.uint8); Rc24[:,:23]=Rc
    inf=os.path.join(HERE,f".mitm_in_{tag}.bin"); outf=os.path.join(HERE,f".mitm_out_{tag}.bin")
    with open(inf,"wb") as f:
        f.write(struct.pack("<II",NL,NR))
        f.write(constb.tobytes()); f.write(VALID.tobytes())
        f.write(Lc24.tobytes()); f.write(Ly.astype("<u8").tobytes())
        f.write(Rc24.tobytes()); f.write(Ry.astype("<u8").tobytes())
    tC=time.time()
    NPROC=int(os.environ.get("NPROC","8"))
    step=(NR+NPROC-1)//NPROC
    procs=[]; outs=[]
    for p in range(NPROC):
        rs=p*step; re=min(NR,(p+1)*step)
        if rs>=re: break
        of=f"{outf}.{p}"; outs.append(of)
        procs.append(subprocess.Popen([MITMBIN,inf,of,str(rs),str(re)],stderr=subprocess.PIPE))
    Ys=[]
    for pr,of in zip(procs,outs):
        pr.wait()
        with open(of,"rb") as f:
            n=struct.unpack("<I",f.read(4))[0]
            if n: Ys.append(np.frombuffer(f.read(n*8),dtype="<u8"))
        os.remove(of)
    Ys=np.concatenate(Ys) if Ys else np.array([],dtype="<u8")
    n=len(Ys)
    if verbose: print(f"C returned {n} valid-hex candidates, merge {time.time()-tC:.1f}s")
    # reconstruct keyhex for all candidates (vectorized) + AES check
    win=aes_filter(Ys,W,constx,d,H)
    try: os.remove(inf)
    except OSError: pass
    if verbose: print(f"KEY recovery total {time.time()-t0:.1f}s -> {win.decode() if win else None}")
    return win

def aes_filter(Ys,W,constx,d,H):
    if len(Ys)==0: return None
    Wcol=np.array([W[x]&((1<<d)-1) for x in range(256)],dtype=np.uint64)
    cbit=np.array([constx[x] for x in range(256)],np.uint8)
    Y=np.asarray(Ys,dtype=np.uint64)
    # keyhex bytes
    kh=np.zeros((len(Y),32),np.uint8)
    def pc(a):
        x=a.copy()
        x=x-((x>>np.uint64(1))&np.uint64(0x5555555555555555))
        x=(x&np.uint64(0x3333333333333333))+((x>>np.uint64(2))&np.uint64(0x3333333333333333))
        x=(x+(x>>np.uint64(4)))&np.uint64(0x0f0f0f0f0f0f0f0f)
        return ((x*np.uint64(0x0101010101010101))>>np.uint64(56)).astype(np.uint8)
    for bb in range(32):
        byte=np.zeros(len(Y),np.uint8)
        for j in range(8):
            x=8*bb+j
            p=(pc(Wcol[x]&Y)&1)^cbit[x]
            byte|=(p<<(7-j)).astype(np.uint8)
        kh[:,bb]=byte
    # AES check each
    for i in range(len(Y)):
        s=bytes(kh[i]).decode('latin1')
        try: key=bytes.fromhex(s)
        except: continue
        if len(key)!=16: continue
        if G.b2i(AES.new(key,AES.MODE_ECB).encrypt(b'\0'*16))==H:
            return s.encode()
    return None

# ---- local self-test ----
if __name__=="__main__":
    key=os.urandom(16); nonce=os.urandom(16)
    E,H,J0=G.gcm_HJ0(key,nonce); keyhex=key.hex().encode()
    def hi(ch):
        cb=ch.encode()
        c=AES.new(key,AES.MODE_GCM,nonce=nonce); c.encrypt(cb+CM.TEMPLATE_MID+keyhex)
        return cb, c.digest().hex()[0::2]
    # 6 chars: 3,G,U (len47) for H; +48,49,50
    H47=[];ch47=[]
    for ch in ['3','G','U']:
        cb,hh=hi(ch); ch47.append(cb); H47.append(hh)
    Hrec=A.recover_H(H47,ch47)
    print("H ok:", Hrec==H)
    obs=[]
    for ch,L in [("3",47),("À",48),("ࠀ",49),("\U00010000",50)]:
        cb,hh=hi(ch); obs.append((L,cb,hh))
    win=recover_key(Hrec,obs)
    print("MATCH:", win==keyhex, "true:",keyhex.decode())
