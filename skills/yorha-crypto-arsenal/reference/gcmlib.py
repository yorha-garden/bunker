# GF(2^128) arithmetic (GCM bit-reflected convention) + GCM tag model + GF(2) linear algebra helpers.
from Crypto.Cipher import AES
R = 0xE1000000000000000000000000000000
ORDER = (1<<128)-1
ONE = 0x80000000000000000000000000000000  # multiplicative identity in this rep

def gf_mul(x, y):
    z=0; v=x
    for i in range(128):
        if (y>>(127-i))&1: z^=v
        if v&1: v=(v>>1)^R
        else: v>>=1
    return z
def gf_pow(x,n):
    r=ONE; b=x
    while n>0:
        if n&1: r=gf_mul(r,b)
        b=gf_mul(b,b); n>>=1
    return r
def gf_inv(x): return gf_pow(x, ORDER-1)  # x^(2^128-2): multiplicative group order = ORDER = 2^128-1
def b2i(b): return int.from_bytes(b,'big')
def i2b(x): return x.to_bytes(16,'big')
def ghash(H,data):
    y=0
    for i in range(0,len(data),16):
        y=gf_mul(y^b2i(data[i:i+16]),H)
    return y
def gcm_HJ0(key,nonce):
    E=AES.new(key,AES.MODE_ECB)
    H=b2i(E.encrypt(b'\x00'*16))
    if len(nonce)==12:
        J0=b2i(nonce+b'\x00\x00\x00\x01')
    else:
        s=(16-(len(nonce)%16))%16
        data=nonce+b'\x00'*s+(0).to_bytes(8,'big')+(len(nonce)*8).to_bytes(8,'big')
        J0=ghash(H,data)
    return E,H,J0
def inc32(x):
    top=x&~0xffffffff; ctr=(x+1)&0xffffffff
    return top|ctr

# --- GF(2) linear algebra: represent 128-bit vectors as ints (MSB-first bit index 0) ---
def mult_matrix(M):
    """rows[r] = mask over input bits s.t. output bit r = parity(rows[r] & x) where y = M*x (field mult)."""
    cols=[gf_mul(M,1<<(127-i)) for i in range(128)]
    rows=[]
    for r in range(128):
        row=0
        for i in range(128):
            if (cols[i]>>(127-r))&1: row|=(1<<(127-i))
        rows.append(row)
    return rows
def high_nibble_rows():
    rows=[]
    for b in range(16):
        for j in range(4):
            rows.append(1<<(127-(8*b+j)))
    return rows
def low_nibble_rows():
    rows=[]
    for b in range(16):
        for j in range(4,8):
            rows.append(1<<(127-(8*b+j)))
    return rows
def matmul_rows(A,B):
    Bcols=[0]*128
    for i in range(128):
        rm=B[i]
        for c in range(128):
            if (rm>>(127-c))&1: Bcols[c]|=(1<<(127-i))
    out=[]
    for r in range(len(A)):
        ar=A[r]; nr=0
        for c in range(128):
            if bin(ar&Bcols[c]).count("1")&1: nr|=(1<<(127-c))
        out.append(nr)
    return out
def apply_rows(rows,x):
    out=0
    for rm in rows:
        out=(out<<1)|(bin(rm&x).count("1")&1)
    return out

if __name__=="__main__":
    import os
    for _ in range(3):
        k=os.urandom(16);n=os.urandom(16);pt=os.urandom(47)
        c=AES.new(k,AES.MODE_GCM,nonce=n);c.encrypt(pt);real=c.digest()
        E,H,J0=gcm_HJ0(k,n)
        Eecb=AES.new(k,AES.MODE_ECB);ct=b'';ctr=J0
        for i in range(0,len(pt),16):
            ctr=inc32(ctr);ks=Eecb.encrypt(i2b(ctr));ct+=bytes(a^b for a,b in zip(pt[i:i+16],ks))
        padded=ct+b'\x00'*((16-len(ct)%16)%16);lb=(0).to_bytes(8,'big')+(len(ct)*8).to_bytes(8,'big')
        tag=i2b(ghash(H,padded+lb)^b2i(Eecb.encrypt(i2b(J0))))
        print("model ok:", tag==real)
