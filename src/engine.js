/** Digital Display OCR — original implementation, MIT, azolazol. No network or dependencies. */
export const VERSION='0.1.0';
export const DIGITS=['1111110','0110000','1101101','1111001','0110011','1011011','1011111','1110000','1111111','1111011'];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function renderDigit(digit,w=32,h=48,{thickness=.13,slant=0,tail7=false}={}){
 const mask=new Uint8Array(w*h),t=thickness;
 const zones=[[t,0,1-t,t],[1-t,t,1,.5-t/2],[1-t,.5+t/2,1,1-t],[t,1-t,1-t,1],[0,.5+t/2,t,1-t],[0,t,t,.5-t/2],[t,.5-t/2,1-t,.5+t/2]];
 let bits=DIGITS[digit];if(tail7&&digit===7)bits='1110010';
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const nx=x/w+slant*(y/h-.5),ny=y/h;mask[y*w+x]=zones.some(([a,b,c,d],i)=>bits[i]==='1'&&nx>=a&&nx<=c&&ny>=b&&ny<=d)?1:0;}
 return mask;
}
function extrema(src,w,h,r,max){
 const horizontal=new Float32Array(w*h),out=new Float32Array(w*h),queue=new Int32Array(Math.max(w,h)*2+2);
 const pass=(input,output,length,lines,stride,step)=>{for(let line=0;line<lines;line++){let head=0,tail=0,next=0;for(let i=0;i<length;i++){const end=Math.min(length-1,i+r);for(;next<=end;next++){const v=input[line*step+next*stride];while(tail>head&&(max?input[line*step+queue[tail-1]*stride]<=v:input[line*step+queue[tail-1]*stride]>=v))tail--;queue[tail++]=next;}while(queue[head]<i-r)head++;output[line*step+i*stride]=input[line*step+queue[head]*stride];}}};
 pass(src,horizontal,w,h,1,w);pass(horizontal,out,h,w,w,1);return out;
}
export function binarize(image,{sensitivity=.82,invert=false,radius}={}){
 const {width:w,height:h,data}=image;if(!Number.isInteger(w)||!Number.isInteger(h)||w<2||h<2||w*h>4e6||data.length!==w*h*4)throw Error('Invalid RGBA image (maximum 4 million pixels)');
 const gray=new Float32Array(w*h);let min=255,max=0;for(let i=0;i<gray.length;i++){const p=i*4;const v=.299*data[p]+.587*data[p+1]+.114*data[p+2];gray[i]=invert?255-v:v;min=Math.min(min,gray[i]);max=Math.max(max,gray[i]);}
 if(max-min<8)return new Uint8Array(w*h);
 const r=radius??Math.max(3,Math.round(Math.min(w,h)*.025)),bg=extrema(extrema(gray,w,h,r,true),w,h,r,false),mask=new Uint8Array(w*h);
 for(let i=0;i<mask.length;i++)mask[i]=bg[i]-gray[i]>8&&gray[i]<bg[i]*sensitivity?1:0;return mask;
}
function runs(values,threshold,gap=1){const found=[];let first=-1,last=-1;for(let i=0;i<=values.length;i++){if(i<values.length&&values[i]>=threshold){if(first<0)first=i;last=i;}else if(first>=0&&(i-last>gap||i===values.length)){found.push([first,last]);first=-1;}}return found;}
export function normalizeGlyph(mask,w,h,box){
 let {x,y,width:bw,height:bh}=box;const out=new Uint8Array(32*48);const canonical=Math.max(bw,bh*.55),left=x+bw-canonical;
 for(let yy=0;yy<48;yy++)for(let xx=0;xx<32;xx++){const sx=Math.floor(left+(xx+.5)*canonical/32),sy=Math.floor(y+(yy+.5)*bh/48);out[yy*32+xx]=sx>=x&&sx<x+bw&&sy>=y&&sy<y+bh&&sx>=0&&sx<w&&sy>=0&&sy<h?mask[sy*w+sx]:0;}return out;
}
let bank;
function templates(){if(!bank){bank=[];for(let d=0;d<10;d++)for(const thickness of [.10,.14,.18,.23])for(const slant of [-.12,0,.12])for(const tail7 of d===7?[false,true]:[false]){const mask=renderDigit(d,32,48,{thickness,slant,tail7});bank.push({digit:d,mask});}}return bank;}
export function validateProfile(profile){if(!Array.isArray(profile)||profile.length>200)throw Error('Invalid template profile');return profile.map(t=>{if(!Number.isInteger(t.digit)||t.digit<0||t.digit>9||!Array.isArray(t.mask)||t.mask.length!==1536||t.mask.some(v=>v!==0&&v!==1))throw Error('Invalid digit template');return {digit:t.digit,mask:Uint8Array.from(t.mask)};});}
export function matchGlyph(mask,{profile=[],minScore=.55,minMargin=.035}={}){
 if(mask.length!==1536)throw Error('Expected 32×48 normalized glyph');
 const counts=new Array(10).fill(0),sources=new Array(10).fill('standard');let ink=0;for(const v of mask)ink+=v;if(ink<15)return {digit:null,score:0,margin:0,alternatives:[],reason:'blank'};
 const custom=validateProfile(profile);
 for(const t of [...templates(),...custom]){let intersect=0,union=0;for(let i=0;i<mask.length;i++){if(mask[i]&&t.mask[i])intersect++;if(mask[i]||t.mask[i])union++;}const score=union?intersect/union:0;if(score>counts[t.digit]){counts[t.digit]=score;sources[t.digit]=custom.includes(t)?'custom':'standard';}}
 const ranked=counts.map((score,digit)=>({digit,score,source:sources[digit]})).sort((a,b)=>b.score-a.score),best=ranked[0],margin=best.score-ranked[1].score;
 return {...best,digit:best.score>=minScore&&margin>=minMargin?best.digit:null,margin,alternatives:ranked.slice(0,3),reason:best.score<minScore?'poor-match':margin<minMargin?'ambiguous':null};
}
export function readRow(mask,w,h,rect,{profile=[],minScore=.55,minMargin=.035}={}){
 const x0=clamp(Math.round(rect.x),0,w-1),y0=clamp(Math.round(rect.y),0,h-1),x1=clamp(Math.round(rect.x+rect.width),x0+1,w),y1=clamp(Math.round(rect.y+rect.height),y0+1,h);
 const rows=new Uint32Array(y1-y0);for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)rows[y-y0]+=mask[y*w+x];
 const inkRows=[...rows.keys()].filter(y=>rows[y]>=Math.max(1,(x1-x0)*.015));if(!inkRows.length)return {value:null,digits:[],reason:'blank',box:rect};
 const top=y0+inkRows[0],bottom=y0+inkRows.at(-1),height=bottom-top+1;
 if(height<8)return {value:null,digits:[],reason:'too-small',box:rect};
 const cols=new Uint32Array(x1-x0);for(let x=x0;x<x1;x++)for(let y=top;y<=bottom;y++)cols[x-x0]+=mask[y*w+x];
 const groups=runs(cols,Math.max(1,height*.065),Math.max(1,Math.round(height*.035)));
 const digits=groups.map(([l,r])=>{const box={x:x0+l,y:top,width:r-l+1,height};return {...matchGlyph(normalizeGlyph(mask,w,h,box),{profile,minScore,minMargin}),box};});
 let reason=digits.length<2||digits.length>3?'digit-count':digits.some(d=>d.digit===null)?'uncertain-digit':null;
 const clipped=top<=y0||bottom>=y1-1||groups.some(([l,r])=>l===0||r>=x1-x0-1);if(clipped)reason='touching-crop-edge';
 return {value:reason?null:Number(digits.map(d=>d.digit).join('')),digits,score:digits.length?Math.min(...digits.map(d=>d.score)):0,reason,box:{x:x0+(groups[0]?.[0]??0),y:top,width:groups.length?groups.at(-1)[1]-groups[0][0]+1:0,height}};
}
export function assignFields(groups){
 const candidates=groups.filter(g=>g.value!==null&&g.box.height>=8),triples=[];
 for(const a of candidates)for(const b of candidates)for(const c of candidates){if(a===b||b===c||a===c||a.box.y+a.box.height>b.box.y||b.box.y+b.box.height>c.box.y)continue;const major=(a.box.height+b.box.height)/2,similar=Math.min(a.box.height,b.box.height)/Math.max(a.box.height,b.box.height);if(similar<.7||c.box.height>major*1.05||c.box.height<major*.35)continue;const sizeBonus=1-Math.abs(c.box.height/major-.75);triples.push({a,b,c,score:(a.score+b.score+c.score)/3+.12*similar+.08*sizeBonus});}
 triples.sort((a,b)=>b.score-a.score);if(!triples.length)return {sys:null,dia:null,pulse:null,status:'incomplete',reason:'Need two large rows and a smaller lower row'};
 if(triples[1]&&triples[0].score-triples[1].score<.03)return {sys:null,dia:null,pulse:null,status:'ambiguous',reason:'Multiple possible row assignments'};
 const {a,b,c}=triples[0];const warning=a.value<=b.value?'SYS must be greater than DIA; values are not swapped':null;
 return {sys:a.value,dia:b.value,pulse:c.value,status:warning?'review':'candidate',reason:warning,groups:[a,b,c]};
}
export function recognizeDisplay(image,{roi,fieldRois,...options}={}){
 const {width:w,height:h}=image,mask=binarize(image,options),area=roi??{x:0,y:0,width:w,height:h};let groups=[];
 if(fieldRois){groups=['sys','dia','pulse'].map(k=>fieldRois[k]?readRow(mask,w,h,fieldRois[k],options):{value:null,digits:[],reason:'no-field-box'});const [a,b,c]=groups;return {version:VERSION,mask,width:w,height:h,candidates:groups,sys:a.value,dia:b.value,pulse:c.value,status:groups.every(g=>g.value!==null)?(a.value>b.value?'candidate':'review'):'incomplete',reason:'Explicit field boxes; compare the original before use'};}
 const top=clamp(Math.round(area.y),0,h-1),bottom=clamp(Math.round(area.y+area.height),top+1,h),left=clamp(Math.round(area.x),0,w-1),right=clamp(Math.round(area.x+area.width),left+1,w),rows=new Uint32Array(bottom-top);
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)rows[y-top]+=mask[y*w+x];
 const bands=runs(rows,Math.max(2,(right-left)*.015),Math.max(1,Math.round((bottom-top)*.03)));
 for(const [a,b] of bands){if(b-a+1<(options.minHeight??10))continue;const pad=Math.max(2,Math.round((b-a)*.1));groups.push(readRow(mask,w,h,{x:left,y:Math.max(top,top+a-pad),width:right-left,height:Math.min(bottom,top+b+pad+1)-Math.max(top,top+a-pad)},options));}
 const result=assignFields(groups);return {...result,version:VERSION,mask,width:w,height:h,candidates:groups};
}
