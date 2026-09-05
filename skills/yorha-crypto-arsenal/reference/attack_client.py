"""Full attack: recover KEY (round0 high nibbles) + NONCE (round1 low nibbles) -> flag.
Works over a socket (live) or a subprocess (local prob.py test)."""
import os, sys, time, socket, subprocess, re
import gcmlib as G
import attack as A
import mitm_driver as MD
import nonce_recover as NR
import clean_measure as CM

CHARS = "3GUÀࠀ𐀀"   # 6 codepoints -> lengths 47,47,47,48,49,50
LINE = (CHARS+"\n").encode("utf-8")

class Conn:
    def __init__(self, sock=None, proc=None):
        self.sock=sock; self.proc=proc; self.buf=b""
    def _readsome(self):
        if self.sock is not None:
            d=self.sock.recv(65536)
        else:
            d=self.proc.stdout.read1(65536) if hasattr(self.proc.stdout,'read1') else self.proc.stdout.read(1)
        if not d: raise EOFError
        return d
    def send(self,data):
        if self.sock is not None: self.sock.sendall(data)
        else: self.proc.stdin.write(data); self.proc.stdin.flush()
    def read_hex_lines(self, n, timeout=280):
        """Read until we have n lines matching 16 hex chars."""
        out=[]; t0=time.time()
        while len(out)<n:
            while b"\n" not in self.buf:
                self.buf+=self._readsome()
                if time.time()-t0>timeout: raise TimeoutError
            line,self.buf=self.buf.split(b"\n",1)
            s=line.strip().decode(errors="ignore")
            m=re.search(r"([0-9a-f]{16})\s*$", s)
            if m: out.append(m.group(1))
        return out
    def drain(self, secs=2.0):
        t0=time.time();
        if self.sock is not None: self.sock.settimeout(secs)
        try:
            while time.time()-t0<secs:
                self.buf+=self._readsome()
        except Exception: pass
        return self.buf

def run(conn, verbose=True):
    t0=time.time()
    # ---- Round 0: high nibbles ----
    conn.send(LINE)
    high=conn.read_hex_lines(6)
    if verbose: print("round0 high:",high, f"[{time.time()-t0:.1f}s]")
    # H from lines 0,1,2 (chars '3','G','U', all len47)
    ch47=[b'3',b'G',b'U']; H47=[high[0],high[1],high[2]]
    H=A.recover_H(H47,ch47)
    if H is None: print("H recovery failed!"); return None
    if verbose: print("H recovered", f"[{time.time()-t0:.1f}s]")
    # key system: len47('3',line0),48('À',line3),49('ࠀ',line4),50('𐀀',line5)
    obs=[(47,b'3',high[0]),(48,"À".encode(),high[3]),(49,"ࠀ".encode(),high[4]),(50,"\U00010000".encode(),high[5])]
    keyhex=MD.recover_key(H,obs,verbose=verbose,tag="live")
    if keyhex is None: print("KEY recovery failed!"); return None
    key=bytes.fromhex(keyhex.decode())
    if verbose: print("KEY:",keyhex.decode(), f"[{time.time()-t0:.1f}s]")
    conn.send(keyhex+b"\n")
    # ---- Round 1: low nibbles (same chars) ----
    conn.send(LINE)
    low=conn.read_hex_lines(6)
    if verbose: print("round1 low:",low, f"[{time.time()-t0:.1f}s]")
    # full tags for the 4 lengths
    idx=[(47,b'3',0),(48,"À".encode(),3),(49,"ࠀ".encode(),4),(50,"\U00010000".encode(),5)]
    obs_full=[]
    for (L,cb,i) in idx:
        fullhex="".join(high[i][b]+low[i][b] for b in range(16))
        obs_full.append((L,cb,bytes.fromhex(fullhex)))
    nonce=NR.recover_nonce(key,H,obs_full,verbose=verbose)
    if nonce is None: print("NONCE recovery failed!"); return None
    if verbose: print("NONCE:",nonce.hex(), f"[{time.time()-t0:.1f}s]")
    conn.send(nonce.hex().encode()+b"\n")
    # ---- flag ----
    data=conn.drain(3.0)
    print("=== SERVER TAIL ===")
    print(data.decode(errors="ignore"))
    m=re.search(r"(BHFlagY\{[^}]*\}|BHFLAGY\{[^}]*\}|flag\{[^}]*\})", data.decode(errors="ignore"), re.I)
    if m: print("FLAG:",m.group(1))
    return data

def main():
    if len(sys.argv)>=3 and sys.argv[1]=="tcp":
        host,port=sys.argv[2].split(":")
        s=socket.create_connection((host,int(port)),timeout=30)
        s.settimeout(290)
        run(Conn(sock=s))
    else:
        # local test against prob.py
        env=dict(os.environ); env["DYN_FLAG"]="BHFlagY{local_test_flag_1234567890}"
        prob=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"prob.py")
        p=subprocess.Popen([sys.executable,"-u",prob],stdin=subprocess.PIPE,stdout=subprocess.PIPE,
                           stderr=subprocess.STDOUT,env=env,bufsize=0)
        run(Conn(proc=p))

if __name__=="__main__":
    main()
