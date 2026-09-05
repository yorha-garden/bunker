// MITM merge core. Anchor on first 3 match bytes; rights pre-sorted by (Rc0,Rc1,Rc2) for cache locality.
// Input file (LE): u32 NL,NR; u8 constb[23]; u8 VALID[256]; u8 Lc[NL][24]; u64 Yl[NL]; u8 Rc[NR][24]; u64 Yr[NR]
// argv: in out [rstart rend]. Output: u32 count, count*u64 (Yl^Yr) valid-hex winners.
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#define ANCH 3
#define VB (23-ANCH)   // 20 verify bytes

int main(int argc, char** argv){
    FILE* f=fopen(argv[1],"rb");
    if(!f){fprintf(stderr,"open fail\n");return 1;}
    uint32_t NL,NR; fread(&NL,4,1,f); fread(&NR,4,1,f);
    uint8_t constb[23]; fread(constb,1,23,f);
    uint8_t VALID[256]; fread(VALID,1,256,f);
    uint8_t* Lc=malloc((size_t)NL*24); fread(Lc,1,(size_t)NL*24,f);
    uint64_t* Yl=malloc((size_t)NL*8); fread(Yl,8,NL,f);
    uint8_t* Rc=malloc((size_t)NR*24); fread(Rc,1,(size_t)NR*24,f);
    uint64_t* Yr=malloc((size_t)NR*8); fread(Yr,8,NR,f);
    fclose(f);

    const uint32_t NB=1u<<24;
    uint32_t* cnt=calloc(NB,4);
    for(uint32_t i=0;i<NL;i++){ uint8_t* p=Lc+(size_t)i*24;
        cnt[((uint32_t)p[0]<<16)|((uint32_t)p[1]<<8)|p[2]]++; }
    uint32_t* start=malloc((size_t)NB*4);
    uint32_t acc=0; for(uint32_t a=0;a<NB;a++){ start[a]=acc; acc+=cnt[a]; }
    uint8_t* Lcs=malloc((size_t)NL*VB);
    uint64_t* Yls=malloc((size_t)NL*8);
    uint32_t* cur=malloc((size_t)NB*4); memcpy(cur,start,(size_t)NB*4);
    for(uint32_t i=0;i<NL;i++){
        uint8_t* p=Lc+(size_t)i*24;
        uint32_t a=((uint32_t)p[0]<<16)|((uint32_t)p[1]<<8)|p[2];
        uint32_t pos=cur[a]++;
        memcpy(Lcs+(size_t)pos*VB, p+ANCH, VB);
        Yls[pos]=Yl[i];
    }
    free(cur); free(Lc); free(Yl);

    uint8_t vt[16]; int nvt=0;
    for(int b=0;b<256;b++) if(VALID[b]) vt[nvt++]=b;

    uint32_t rstart=0, rend=NR;
    if(argc>=5){ rstart=(uint32_t)strtoul(argv[3],0,10); rend=(uint32_t)strtoul(argv[4],0,10); if(rend>NR)rend=NR; }

    size_t cap=1<<20; uint64_t* out=malloc(cap*8); size_t no=0;
    uint8_t c0=constb[0],c1=constb[1],c2=constb[2];
    uint8_t cc[VB]; for(int i=0;i<VB;i++) cc[i]=constb[ANCH+i];

    for(uint32_t r=rstart;r<rend;r++){
        uint8_t* rp=Rc+(size_t)r*24;
        uint8_t base0=rp[0]^c0, base1=rp[1]^c1, base2=rp[2]^c2;
        uint8_t rcx[VB]; for(int i=0;i<VB;i++) rcx[i]=rp[ANCH+i]^cc[i];
        uint64_t yr=Yr[r];
        for(int i0=0;i0<nvt;i0++){ uint8_t need0=base0^vt[i0];
        for(int i1=0;i1<nvt;i1++){ uint8_t need1=base1^vt[i1];
        for(int i2=0;i2<nvt;i2++){ uint8_t need2=base2^vt[i2];
            uint32_t a=((uint32_t)need0<<16)|((uint32_t)need1<<8)|need2;
            uint32_t c=cnt[a]; if(!c) continue;
            uint32_t s=start[a];
            const uint8_t* lp=Lcs+(size_t)s*VB;
            for(uint32_t k=0;k<c;k++, lp+=VB){
                unsigned ok=1;
                for(int i=0;i<VB;i++){
                    uint8_t x=lp[i]^rcx[i];
                    ok &= (unsigned)(((x>=0x30)&(x<=0x39))|((x>=0x61)&(x<=0x66)));
                }
                if(ok){
                    if(no>=cap){cap*=2; out=realloc(out,cap*8);}
                    out[no++]=Yls[s+k]^yr;
                }
            }
        }}}
    }
    fprintf(stderr,"r[%u..%u) found=%zu\n",rstart,rend,no);
    FILE* g=fopen(argv[2],"wb");
    uint32_t n32=(uint32_t)no; fwrite(&n32,4,1,g); fwrite(out,8,no,g); fclose(g);
    return 0;
}
