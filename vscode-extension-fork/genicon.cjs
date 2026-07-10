const fs=require("fs"),z=require("zlib"),W=128,H=128,p=Buffer.alloc(W*H*4);
const bg=[30,30,60,255],fg=[180,130,255,255],cx=64,cy=64;
function sp(x,y,r,g,b,a){if(x<0||x>=W||y<0||y>=H)return;const i=(y*W+x)*4;p[i]=r;p[i+1]=g;p[i+2]=b;p[i+3]=a;}
for(let y=0;y<H;y++)for(let x=0;x<W;x++)sp(x,y,bg[0],bg[1],bg[2],bg[3]);
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const d=Math.hypot(x-cx,y-cy);if(d<55){const g=1-d/55;sp(x,y,Math.min(255,bg[0]+(fg[0]-bg[0])*g*0.3|0),Math.min(255,bg[1]+(fg[1]-bg[1])*g*0.3|0),Math.min(255,bg[2]+(fg[2]-bg[2])*g*0.3|0),255);}}
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const d=Math.hypot(x-cx,y-cy);if(d>=28&&d<=46)sp(x,y,fg[0],fg[1],fg[2],255);if(d>=32&&d<=42)sp(x,y,255,255,255,255);if(d>46&&d<49)sp(x,y,fg[0],fg[1],fg[2],((49-d)/3*255)|0);}
for(let t=-4;t<16;t++)for(let w=-4;w<=4;w++){const d=Math.abs(w)+Math.abs(t);if(d<=6)sp(cx+16+t+w,cy+16+t,255,255,255,255);else if(d<=9)sp(cx+16+t+w,cy+16+t,255,255,255,((9-d)/3*200)|0);}
function png(w,h,px){const raw=Buffer.alloc(h*(1+w*4));for(let y=0;y<h;y++){raw[y*(1+w*4)]=0;px.slice(y*w*4,(y+1)*w*4).copy(raw,y*(1+w*4)+1);}const zd=z.deflateSync(raw);function c(b){let c=0xffffffff;const t=new Uint32Array(256);for(let i=0;i<256;i++){let v=i;for(let j=0;j<8;j++)v=v&1?0xedb88320^v>>>1:v>>>1;t[i]=v;}for(let i=0;i<b.length;i++)c=t[(c^b[i])&255]^c>>>8;return(c^0xffffffff)>>>0;}const s=Buffer.from([137,80,78,71,13,10,26,10]);const k=[];function a(t,d){const l=Buffer.alloc(4);l.writeUInt32BE(d.length);const cd=Buffer.concat([Buffer.from(t),d]);const cb=Buffer.alloc(4);cb.writeUInt32BE(c(cd));k.push(l,Buffer.from(t),d,cb);}const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;a("IHDR",ih);a("IDAT",zd);a("IEND",Buffer.alloc(0));return Buffer.concat([s,...k]);}
fs.writeFileSync("icon.png",png(W,H,p));
console.log("OK icon.png "+png(W,H,p).length+" B");
