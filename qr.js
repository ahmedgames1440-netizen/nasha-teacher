/* ══════════ مولّد رمز QR ══════════
   يعمل بدون إنترنت ودون أي مكتبة خارجية. وضع البايت (UTF-8)، الإصدارات 1–10،
   مستوى تصحيح الخطأ M ثم L للروابط الطويلة. المخرج مصفوفة منطقية. */
const QR_EC={ // [عدد بايتات التصحيح لكل كتلة, [عدد الكتل, بايتات البيانات], ...]
 Q:[[13,[[1,13]]],[22,[[1,22]]],[18,[[2,17]]],[26,[[2,24]]],[18,[[2,15],[2,16]]],
    [24,[[4,19]]],[18,[[2,14],[4,15]]],[22,[[4,18],[2,19]]],[20,[[4,16],[4,17]]],[24,[[6,19],[2,20]]]],
 L:[[7,[[1,19]]],[10,[[1,34]]],[15,[[1,55]]],[20,[[1,80]]],[26,[[1,108]]],
    [18,[[2,68]]],[20,[[2,78]]],[24,[[2,97]]],[30,[[2,116]]],[18,[[2,68],[2,69]]]],
 M:[[10,[[1,16]]],[16,[[1,28]]],[26,[[1,44]]],[18,[[2,32]]],[24,[[2,43]]],
    [16,[[4,27]]],[18,[[4,31]]],[22,[[2,38],[2,39]]],[22,[[3,36],[2,37]]],[26,[[4,43],[1,44]]]]
};
const QR_ALIGN=[[],[6,18],[6,22],[6,26],[6,30],[6,34],[6,22,38],[6,24,42],[6,26,46],[6,28,50]];

/* ——— حسابات حقل جالوا GF(256) لتصحيح الأخطاء ——— */
const GF_EXP=new Uint8Array(512), GF_LOG=new Uint8Array(256);
(function(){let x=1;for(let i=0;i<255;i++){GF_EXP[i]=x;GF_LOG[x]=i;x<<=1;if(x&0x100)x^=0x11D;}
 for(let i=255;i<512;i++)GF_EXP[i]=GF_EXP[i-255];})();
function gfMul(a,b){return (a===0||b===0)?0:GF_EXP[GF_LOG[a]+GF_LOG[b]];}
function rsGenPoly(n){
  let p=[1];
  for(let i=0;i<n;i++){
    const q=[1,GF_EXP[i]],r=new Array(p.length+1).fill(0);
    for(let j=0;j<p.length;j++)for(let k=0;k<2;k++)r[j+k]^=gfMul(p[j],q[k]);
    p=r;
  }
  return p;
}
function rsEncode(data,ecLen){
  const gen=rsGenPoly(ecLen), res=new Array(data.length+ecLen).fill(0);
  for(let i=0;i<data.length;i++)res[i]=data[i];
  for(let i=0;i<data.length;i++){
    const c=res[i];if(c===0)continue;
    for(let j=0;j<gen.length;j++)res[i+j]^=gfMul(gen[j],c);
  }
  return res.slice(data.length);
}

/* ——— البيانات ——— */
function qrBytes(str){
  const out=[],s=unescape(encodeURIComponent(str));
  for(let i=0;i<s.length;i++)out.push(s.charCodeAt(i));
  return out;
}
function qrPickVersion(len,lvl){
  for(let v=1;v<=10;v++){
    const [ec,groups]=QR_EC[lvl][v-1];
    const dataCw=groups.reduce((s,[n,c])=>s+n*c,0);
    const countBits=(v<10)?8:16;
    if(dataCw*8>=4+countBits+len*8)return v;
  }
  return 0;
}
function qrBuildCodewords(bytes,v,lvl){
  const [ecLen,groups]=QR_EC[lvl][v-1];
  const dataCw=groups.reduce((s,[n,c])=>s+n*c,0);
  const countBits=(v<10)?8:16;
  // تيار البتات: مؤشر الوضع + الطول + البيانات + الإنهاء + الحشو
  const bits=[];
  const push=(val,n)=>{for(let i=n-1;i>=0;i--)bits.push((val>>i)&1);};
  push(4,4);push(bytes.length,countBits);
  bytes.forEach(b=>push(b,8));
  for(let i=0;i<4&&bits.length<dataCw*8;i++)bits.push(0);
  while(bits.length%8)bits.push(0);
  const cw=[];
  for(let i=0;i<bits.length;i+=8){let b=0;for(let j=0;j<8;j++)b=(b<<1)|bits[i+j];cw.push(b);}
  const PAD=[0xEC,0x11];let pi=0;
  while(cw.length<dataCw)cw.push(PAD[pi++%2]);
  // تقسيم لكتل، تصحيح لكل كتلة، ثم تشبيك
  const dBlocks=[],eBlocks=[];let off=0;
  groups.forEach(([n,c])=>{for(let i=0;i<n;i++){const d=cw.slice(off,off+c);off+=c;dBlocks.push(d);eBlocks.push(rsEncode(d,ecLen));}});
  const out=[];
  const maxD=Math.max(...dBlocks.map(b=>b.length));
  for(let i=0;i<maxD;i++)dBlocks.forEach(b=>{if(i<b.length)out.push(b[i]);});
  for(let i=0;i<ecLen;i++)eBlocks.forEach(b=>out.push(b[i]));
  return {out,dBlocks,eBlocks,ecLen};
}

/* ——— بناء المصفوفة ——— */
function qrMatrix(v){
  const n=v*4+17;
  const m=Array.from({length:n},()=>new Array(n).fill(null)); // null = وحدة بيانات حرة
  const setF=(r,c,val)=>{if(r>=0&&r<n&&c>=0&&c<n)m[r][c]={v:val,f:true};};
  // أنماط الكشف الثلاثة + فواصلها
  [[0,0],[0,n-7],[n-7,0]].forEach(([R,C])=>{
    for(let r=-1;r<=7;r++)for(let c=-1;c<=7;c++){
      const on=(r>=0&&r<=6&&(c===0||c===6))||(c>=0&&c<=6&&(r===0||r===6))||(r>=2&&r<=4&&c>=2&&c<=4);
      setF(R+r,C+c,on?1:0);
    }
  });
  // أنماط التوقيت
  for(let i=8;i<n-8;i++){setF(6,i,i%2===0?1:0);setF(i,6,i%2===0?1:0);}
  // أنماط المحاذاة
  const al=QR_ALIGN[v-1];
  al.forEach(r=>al.forEach(c=>{
    if((r<=8&&c<=8)||(r<=8&&c>=n-9)||(r>=n-9&&c<=8))return;
    for(let dr=-2;dr<=2;dr++)for(let dc=-2;dc<=2;dc++){
      const on=Math.max(Math.abs(dr),Math.abs(dc))!==1;
      setF(r+dr,c+dc,on?1:0);
    }
  }));
  // الوحدة الداكنة + حجز مواضع معلومات النسق
  setF(n-8,8,1);
  for(let i=0;i<9;i++){if(m[8][i]===null)setF(8,i,0);if(m[i][8]===null)setF(i,8,0);}
  for(let i=0;i<8;i++){if(m[8][n-1-i]===null)setF(8,n-1-i,0);if(m[n-1-i][8]===null)setF(n-1-i,8,0);}
  // معلومات الإصدار (7 فأعلى)
  if(v>=7){
    let d=v<<12,g=0x1F25;
    for(let i=17;i>=12;i--)if((d>>i)&1)d^=g<<(i-12);
    const bits=(v<<12)|d;
    for(let i=0;i<18;i++){
      const b=(bits>>i)&1, r=Math.floor(i/3), c=i%3;
      setF(r,n-11+c,b);setF(n-11+c,r,b);
    }
  }
  return m;
}
function qrPlace(m,cw){
  const n=m.length;let bi=0;
  const bits=[];cw.forEach(b=>{for(let i=7;i>=0;i--)bits.push((b>>i)&1);});
  let up=true;
  for(let c=n-1;c>0;c-=2){
    if(c===6)c--;                                  // عمود التوقيت يُتخطّى
    for(let k=0;k<n;k++){
      const r=up?(n-1-k):k;
      for(const cc of [c,c-1]){
        if(m[r][cc]===null)m[r][cc]={v:bi<bits.length?bits[bi++]:0,f:false};
      }
    }
    up=!up;
  }
  return m;
}
function qrMaskFn(k){
  return [(r,c)=>(r+c)%2===0,(r,c)=>r%2===0,(r,c)=>c%3===0,(r,c)=>(r+c)%3===0,
   (r,c)=>(Math.floor(r/2)+Math.floor(c/3))%2===0,(r,c)=>((r*c)%2)+((r*c)%3)===0,
   (r,c)=>(((r*c)%2)+((r*c)%3))%2===0,(r,c)=>(((r+c)%2)+((r*c)%3))%2===0][k];
}
function qrFormatBits(lvl,mask){
  const L={L:1,M:0,Q:3,H:2}[lvl];
  let d=((L<<3)|mask)<<10, g=0x537;
  for(let i=14;i>=10;i--)if((d>>i)&1)d^=g<<(i-10);
  return ((((L<<3)|mask)<<10)|d)^0x5412;
}
function qrApply(m,lvl,mask){
  const n=m.length, fn=qrMaskFn(mask);
  const g=m.map(row=>row.map(x=>x.f?x.v:(x.v^(fn(0,0)!==undefined?0:0))));
  // نطبّق القناع على وحدات البيانات فقط
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(!m[r][c].f)g[r][c]=m[r][c].v^(fn(r,c)?1:0);
  // معلومات النسق
  const f=qrFormatBits(lvl,mask);
  for(let i=0;i<15;i++){
    const b=(f>>(14-i))&1;   // البت الأعلى يُوضع أولاً وفق المواصفة
    if(i<6){g[8][i]=b;} else if(i<8){g[8][i+1]=b;} else if(i===8){g[7][8]=b;} else {g[14-i][8]=b;}
    if(i<7){g[n-1-i][8]=b;} else {g[8][n-15+i]=b;}
  }
  return g;
}
function qrFalseFinders(g){
  // الماسحات تبحث عن نسبة 1:1:3:1:1 بأي مقاس لا عن نمط بعرض ثابت،
  // فنعدّ كل تتابع يقارب هذه النسبة لأنه قد يُوهم الكاشف بنمط كشف زائف.
  const n=g.length;let hits=0;
  const scan=(get)=>{
    for(let a=0;a<n;a++){
      const runs=[];let val=get(a,0),len=1;
      for(let b=1;b<n;b++){const v=get(a,b);if(v===val)len++;else{runs.push([val,len]);val=v;len=1;}}
      runs.push([val,len]);
      for(let i=0;i+4<runs.length;i++){
        if(runs[i][0]!==1)continue;                       // يبدأ بداكن
        const w=[runs[i][1],runs[i+1][1],runs[i+2][1],runs[i+3][1],runs[i+4][1]];
        const u=w[0];                                     // وحدة القياس المقدّرة
        if(u<1)continue;
        const want=[u,u,3*u,u,u];
        let okr=true;
        for(let j=0;j<5;j++){if(Math.abs(w[j]-want[j])>Math.max(1,u*0.5)){okr=false;break;}}
        if(okr)hits++;
      }
    }
  };
  scan((a,b)=>g[a][b]);scan((a,b)=>g[b][a]);
  return hits;
}
function qrPenalty(g){
  const n=g.length;let p=0;
  const run=(get)=>{for(let a=0;a<n;a++){let cnt=1;for(let b=1;b<n;b++){
    if(get(a,b)===get(a,b-1))cnt++;else{if(cnt>=5)p+=cnt-2;cnt=1;}}
    if(cnt>=5)p+=cnt-2;}};
  run((a,b)=>g[a][b]);run((a,b)=>g[b][a]);
  for(let r=0;r<n-1;r++)for(let c=0;c<n-1;c++){
    const s=g[r][c]+g[r][c+1]+g[r+1][c]+g[r+1][c+1];
    if(s===0||s===4)p+=3;
  }
  // القاعدة الثالثة: النمط 1011101 متبوعاً أو مسبوقاً بأربع فواتح — في الاتجاهين
  const P1=[1,0,1,1,1,0,1,0,0,0,0], P2=[0,0,0,0,1,0,1,1,1,0,1];
  // النافذة تمتد خارج الرمز لأن المنطقة الهادئة فاتحة وتُكمل النمط الكاذب
  const chk=(get)=>{for(let a=0;a<n;a++)for(let b=0;b<=n-11;b++){
    let o1=true,o2=true;
    for(let i=0;i<11;i++){
      const val=get(a,b+i);
      if(val!==P1[i])o1=false; if(val!==P2[i])o2=false;
    }
    if(o1)p+=40; if(o2)p+=40;}};
  chk((a,b)=>g[a][b]);chk((a,b)=>g[b][a]);
  let dark=0;g.forEach(r=>r.forEach(v=>dark+=v));
  p+=Math.floor(Math.abs(dark*100/(n*n)-50)/5)*10;
  return p;
}
// يعيد مصفوفة أرقام 0/1 أو null إذا كان النص أطول من الطاقة
function qrGenerate(text){
  const bytes=qrBytes(text);
  for(const lvl of ["Q","M","L"]){
    const v=qrPickVersion(bytes.length,lvl);
    if(!v)continue;
    const {out}=qrBuildCodewords(bytes,v,lvl);
    const base=qrPlace(qrMatrix(v),out);
    // نرتّب الأقنعة: الأقل توليداً لأنماط كشف كاذبة أولاً، ثم الأقل عقوبة.
    // الأنماط الكاذبة هي ما يمنع الماسح من العثور على الرمز أصلاً.
    let best=null,bestF=Infinity,bestP=Infinity;
    for(let k=0;k<8;k++){
      const g=qrApply(base,lvl,k), f=qrFalseFinders(g), pen=qrPenalty(g);
      if(f<bestF||(f===bestF&&pen<bestP)){bestF=f;bestP=pen;best=g;}
    }
    return best;
  }
  return null;
}
// يحوّل المصفوفة إلى SVG
function qrSvg(text,px){
  const m=qrGenerate(text);
  if(!m)return "";
  const n=m.length,q=4,tot=n+q*2;
  let d="";
  for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(m[r][c])d+="M"+(c+q)+" "+(r+q)+"h1v1h-1z";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${tot} ${tot}" width="${px}" height="${px}" shape-rendering="crispEdges"><rect width="${tot}" height="${tot}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}