/** Digital Display OCR — original implementation, MIT, azolazol. No network or dependencies. */
export const VERSION='0.1.5';
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
function otsuThreshold(gray){
 const hist=new Uint32Array(256);let sum=0;for(const v of gray){const n=Math.round(v);hist[n]++;sum+=n;}let count=0,partial=0,best=-1,threshold=0;
 for(let t=0;t<255;t++){count+=hist[t];partial+=t*hist[t];if(!count||count===gray.length)continue;const diff=partial/count-(sum-partial)/(gray.length-count),variance=count*(gray.length-count)*diff*diff;if(variance>best){best=variance;threshold=t;}}return threshold;
}
// Remove only thin components anchored to the photo boundary; retain clipped glyphs.
export function removeBorderLines(mask,w,h){
 const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length);
 for(let seed=0;seed<mask.length;seed++){if(!mask[seed]||seen[seed])continue;let head=0,tail=1,minX=w,maxX=0,minY=h,maxY=0,edge=false;queue[0]=seed;seen[seed]=1;
 while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);edge ||= x===0||y===0||x===w-1||y===h-1;
 for(const n of [x>0?i-1:-1,x<w-1?i+1:-1,y>0?i-w:-1,y<h-1?i+w:-1])if(n>=0&&mask[n]&&!seen[n]){seen[n]=1;queue[tail++]=n;}}
 const bw=maxX-minX+1,bh=maxY-minY+1,thin=bw<=w*.025||bh<=h*.025,frame=bw>w*.8&&bh>h*.8&&tail/(bw*bh)<.08;
 const cornerStripe=minY===0&&(minX===0||maxX===w-1)&&bw<w*.07&&tail/(bw*bh)<.35;
 if(edge&&(thin||frame||cornerStripe))for(let k=0;k<tail;k++)mask[queue[k]]=0;
 }return mask;
}
function segmentScores(mask){
 const zones=[[.28,.02,.72,.15],[.7,.2,1,.4],[.7,.6,1,.8],[.28,.85,.72,.98],[0,.6,.3,.8],[0,.2,.3,.4],[.28,.43,.72,.57]];
 const levels=zones.map(([x0,y0,x1,y1])=>{let n=0,total=0;for(let y=Math.floor(y0*48);y<y1*48;y++)for(let x=Math.floor(x0*32);x<x1*32;x++){n+=mask[y*32+x];total++;}return Math.min(1,n/total/.48);});
 return DIGITS.map(bits=>levels.reduce((a,v,i)=>a+(bits[i]==='1'?v:1-v),0)/7);
}
export function binarize(image,{sensitivity=.82,invert=false,radius,brightnessThreshold,preprocessing='otsu'}={}){
 const {width:w,height:h,data}=image;if(!Number.isInteger(w)||!Number.isInteger(h)||w<2||h<2||w*h>4e6||data.length!==w*h*4)throw Error('Invalid RGBA image (maximum 4 million pixels)');
 const gray=new Float32Array(w*h);let min=255,max=0;for(let i=0;i<gray.length;i++){const p=i*4;const v=.299*data[p]+.587*data[p+1]+.114*data[p+2];gray[i]=invert?255-v:v;min=Math.min(min,gray[i]);max=Math.max(max,gray[i]);}
 if(max-min<8)return new Uint8Array(w*h);
 const mask=new Uint8Array(w*h);
 if(preprocessing==='otsu'){const threshold=(brightnessThreshold??otsuThreshold(gray))+(sensitivity-.82)*64;for(let i=0;i<mask.length;i++)mask[i]=gray[i]<=threshold?1:0;return removeBorderLines(mask,w,h);}
 // The closing window must span a full stroke, not just its outline.
 // A 2.5% radius erased the centres of large LCD segments. Use a broad
 // image-relative neighbourhood; closing fills dark strokes before comparison.
 const r=radius??Math.max(6,Math.round(Math.min(w,h)*.12)),bg=extrema(extrema(gray,w,h,r,true),w,h,r,false);
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
 const geometry=segmentScores(mask);if(!custom.length)for(let d=0;d<10;d++)counts[d]=.55*counts[d]+.45*geometry[d];
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
 if(fieldRois){groups=['sys','dia','pulse'].map(k=>{if(!fieldRois[k])return {value:null,digits:[],reason:'no-field-box'};const tile=cropRgba(image,fieldRois[k]),localMask=binarize(tile,options),row=readRow(localMask,tile.width,tile.height,{x:0,y:0,width:tile.width,height:tile.height},options);for(let y=0;y<tile.height;y++)mask.set(localMask.subarray(y*tile.width,(y+1)*tile.width),(tile.y+y)*w+tile.x);const move=b=>({...b,x:b.x+tile.x,y:b.y+tile.y});return {...row,box:move(row.box),digits:row.digits.map(d=>({...d,box:move(d.box)}))};});const [a,b,c]=groups;return {version:VERSION,mask,width:w,height:h,candidates:groups,sys:a.value,dia:b.value,pulse:c.value,status:groups.every(g=>g.value!==null)?(a.value>b.value?'candidate':'review'):'incomplete',reason:'Explicit field boxes; compare the original before use'};}
 const top=clamp(Math.round(area.y),0,h-1),bottom=clamp(Math.round(area.y+area.height),top+1,h),left=clamp(Math.round(area.x),0,w-1),right=clamp(Math.round(area.x+area.width),left+1,w),rows=new Uint32Array(bottom-top);
 for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)rows[y-top]+=mask[y*w+x];
 const bands=runs(rows,Math.max(2,(right-left)*.015),Math.max(1,Math.round((bottom-top)*.03)));
 for(const [a,b] of bands){if(b-a+1<(options.minHeight??10))continue;const pad=Math.max(2,Math.round((b-a)*.1));groups.push(readRow(mask,w,h,{x:left,y:Math.max(top,top+a-pad),width:right-left,height:Math.min(bottom,top+b+pad+1)-Math.max(top,top+a-pad)},options));}
 const result=assignFields(groups);return {...result,version:VERSION,mask,width:w,height:h,candidates:groups};
}

// A gesture locates a row; the unpainted original image remains the OCR input.
export function lineToRoi(mask,w,h,points){
 if(!Array.isArray(points)||points.length<2||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),span=Math.max(...xs)-Math.min(...xs);if(span<Math.max(8,w*.025))return null;
 const cy=ys.reduce((a,b)=>a+b,0)/ys.length,left=clamp(Math.floor(Math.min(...xs)-span*.25),0,w-1),right=clamp(Math.ceil(Math.max(...xs)+span*.25),left+1,w),rows=new Uint32Array(h);
 const scanLeft=clamp(Math.ceil(Math.min(...xs)+span*.03),left,right-1),scanRight=clamp(Math.floor(Math.max(...xs)-span*.03),scanLeft+1,right);
 for(let y=0;y<h;y++)for(let x=scanLeft;x<scanRight;x++)rows[y]+=mask[y*w+x];
 const bands=runs(rows,Math.max(2,(right-left)*.02),Math.max(2,Math.round(span*.078))).filter(([a,b])=>b-a>=8);
 const distance=([a,b])=>cy<a?a-cy:cy>b?cy-b:0;bands.sort((a,b)=>distance(a)-distance(b));
 const band=bands[0];if(!band||distance(band)>h*.1)return null;
 const [a,b]=band,pad=Math.max(4,Math.round((b-a)*.1));return {x:left,y:Math.max(0,a-pad),width:right-left,height:Math.min(h,b+pad+1)-Math.max(0,a-pad)};
}
// Estimate digit/background contrast locally, so a grey LCD on a white photo
// is not classified as one solid foreground component.
function cropRgba(image,box){
 const x=clamp(Math.floor(box.x),0,image.width-1),y=clamp(Math.floor(box.y),0,image.height-1),width=clamp(Math.ceil(box.width),1,image.width-x),height=clamp(Math.ceil(box.height),1,image.height-y),data=new Uint8ClampedArray(width*height*4);
 for(let row=0;row<height;row++)data.set(image.data.subarray(((y+row)*image.width+x)*4,((y+row)*image.width+x+width)*4),row*width*4);
 return {x,y,width,height,data};
}
export function imageLineToRoi(image,points,options={}){
 if(!Array.isArray(points)||points.length<2||points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y),span=Math.max(...xs)-Math.min(...xs),cy=ys.reduce((a,b)=>a+b,0)/ys.length;
 if(span<Math.max(8,image.width*.025))return null;
 const reach=Math.min(image.height*.18,span*.65+Math.max(8,image.width*.02)),x=Math.max(0,Math.min(...xs)-span*.25),y=Math.max(0,cy-reach),tile=cropRgba(image,{x,y,width:Math.min(image.width-x,span*1.5),height:Math.min(image.height-y,cy+reach-y)});
 const probe=cropRgba(image,{x:Math.min(...xs),y:Math.max(0,cy-span*.25),width:span,height:Math.min(image.height-Math.max(0,cy-span*.25),span*.5)}),gray=new Float32Array(probe.width*probe.height);for(let i=0;i<gray.length;i++){const v=.299*probe.data[i*4]+.587*probe.data[i*4+1]+.114*probe.data[i*4+2];gray[i]=options.invert?255-v:v;}const threshold=otsuThreshold(gray);
 const mask=binarize(tile,{...options,brightnessThreshold:threshold,preprocessing:'otsu'});
 // A panel edge can cross the complete search window. Exclude persistent
 // columns from row discovery; digit strokes leave space above and below.
 for(let x=0;x<tile.width;x++){let count=0;for(let y=0;y<tile.height;y++)count+=mask[y*tile.width+x];if(count>=tile.height*.88)for(let y=0;y<tile.height;y++)mask[y*tile.width+x]=0;}
 const localPoints=points.map(p=>({x:p.x-tile.x,y:p.y-tile.y})),box=lineToRoi(mask,tile.width,tile.height,localPoints);
 if(!box||box.height>span*1.8||box.y<=0||box.y+box.height>=tile.height)return null;
 // Tighten the horizontal crop to ink that also crosses the marked row.
 // This excludes nearby UI text and short fragments of the panel rim.
 const cols=new Uint32Array(tile.width),center=new Uint32Array(tile.width),mid=cy-tile.y,half=box.height*.18;
 for(let x=box.x;x<box.x+box.width;x++)for(let y=box.y;y<box.y+box.height;y++){cols[x]+=mask[y*tile.width+x];if(Math.abs(y-mid)<=half)center[x]+=mask[y*tile.width+x];}
 const groups=runs(cols,Math.max(2,box.height*.12),2).filter(([a,b])=>{let n=0;for(let x=a;x<=b;x++)n+=center[x];return n>=Math.max(2,(b-a+1)*2);});
 if(!groups.length)return null;const pad=Math.max(4,Math.round(box.height*.06)),left=Math.max(0,groups[0][0]-pad),right=Math.min(tile.width,groups.at(-1)[1]+pad+1);
 return {...box,x:left+tile.x,y:box.y+tile.y,width:right-left};
}

// Centre-out, overlapping local windows avoid thresholding a grey LCD
// together with a bright case. Connected strokes supply row bounds before OCR.
export function recognizeCentered(image,options={}){
 const {width:w,height:h}=image,area=options.roi??{x:0,y:0,width:w,height:h},groups=[],attempts=[];
 const windows=[];for(const scale of [.55,.8,1])for(const cx of (scale===1?[.5]:[.5,.35,.65]))windows.push({x:area.x+area.width*Math.max(0,Math.min(1-scale,cx-scale/2)),y:area.y,width:area.width*scale,height:area.height});
 for(const rect of windows){const tile=cropRgba(image,rect),tw=tile.width,th=tile.height;
 for(const invert of [!!options.invert,!options.invert]){
 const gray=Float32Array.from({length:tw*th},(_,i)=>{const v=.299*tile.data[i*4]+.587*tile.data[i*4+1]+.114*tile.data[i*4+2];return invert?255-v:v;}),first=otsuThreshold(gray);
 const second=otsuThreshold(gray.filter(v=>v<=first));
 const third=otsuThreshold(gray.filter(v=>v<=second));
 for(const threshold of [first,second,third,otsuThreshold(gray.filter(v=>v<=third))]){
 const mask=binarize(tile,{...options,invert,brightnessThreshold:threshold,preprocessing:'otsu'});
 for(const r of [...new Set([Math.max(1,Math.round(Math.min(tw,th)*.006)),Math.max(2,Math.round(Math.min(tw,th)*.022))])]){const joined=extrema(Float32Array.from(mask),tw,th,r,true),seen=new Uint8Array(tw*th),queue=new Int32Array(tw*th),components=[];
 for(let p=0;p<joined.length;p++){if(!joined[p]||seen[p])continue;let head=0,tail=0;queue[tail++]=p;seen[p]=1;let l=tw,t=th,rr=0,b=0;while(head<tail){const i=queue[head++],x=i%tw,y=Math.floor(i/tw);l=Math.min(l,x);rr=Math.max(rr,x);t=Math.min(t,y);b=Math.max(b,y);for(const n of [x>0?i-1:-1,x+1<tw?i+1:-1,y>0?i-tw:-1,y+1<th?i+tw:-1])if(n>=0&&joined[n]&&!seen[n]){seen[n]=1;queue[tail++]=n;}}
 const bh=b-t+1,bw=rr-l+1;if(l<=0||t<=0||rr>=tw-1||b>=th-1||bh<Math.max(12,th*.025)||bh>th*.35||bw<bh*.08||bw>bh*2.5)continue;components.push({x:l,y:t,width:bw,height:bh,pixels:queue.slice(0,tail)});}
 const rowGroups=[];for(const c of components.sort((a,b)=>b.height-a.height)){let row=rowGroups.find(row=>Math.abs(row[0].y-c.y)<row[0].height*.22&&Math.min(row[0].height,c.height)/Math.max(row[0].height,c.height)>.68);if(row)row.push(c);else rowGroups.push([c]);}
 for(const cs of rowGroups){const left=Math.min(...cs.map(c=>c.x)),right=Math.max(...cs.map(c=>c.x+c.width)),top=Math.min(...cs.map(c=>c.y)),bottom=Math.max(...cs.map(c=>c.y+c.height)),pad=Math.max(3,r*2),box={x:Math.max(0,left-pad),y:Math.max(0,top-pad),width:Math.min(tw,left-pad+(right-left)+pad*2)-Math.max(0,left-pad),height:Math.min(th,bottom+pad)-Math.max(0,top-pad)};
 const rowMask=new Uint8Array(tw*th);for(const c of cs)for(const p of c.pixels)rowMask[p]=mask[p];let row=readRow(rowMask,tw,th,box,options);
 if(row.value===null&&cs.length>=2&&cs.length<=3&&cs.every(c=>c.width<c.height*.95)){
 const digits=cs.slice().sort((a,b)=>a.x-b.x).map(c=>{let l=tw,t=th,rr=0,b=0;for(const p of c.pixels)if(mask[p]){const x=p%tw,y=Math.floor(p/tw);l=Math.min(l,x);rr=Math.max(rr,x);t=Math.min(t,y);b=Math.max(b,y);}const box={x:l,y:t,width:rr-l+1,height:b-t+1};return {...matchGlyph(normalizeGlyph(rowMask,tw,th,box),options),box};});
 if(digits.every(d=>d.digit!==null)){const l=Math.min(...digits.map(d=>d.box.x)),t=Math.min(...digits.map(d=>d.box.y)),rr=Math.max(...digits.map(d=>d.box.x+d.box.width)),b=Math.max(...digits.map(d=>d.box.y+d.box.height));row={value:Number(digits.map(d=>d.digit).join('')),digits,score:Math.min(...digits.map(d=>d.score)),reason:null,box:{x:l,y:t,width:rr-l,height:b-t}};}}
 if(row.value===null)continue;const move=b=>({...b,x:b.x+tile.x,y:b.y+tile.y});row.box=move(row.box);row.digits=row.digits.map(d=>({...d,box:move(d.box)}));row.invert=invert;
 if(!groups.some(g=>g.value===row.value&&Math.abs(g.box.y-row.box.y)<row.box.height*.25&&Math.abs(g.box.x-row.box.x)<row.box.height*.5))groups.push(row);
 }
 attempts.push({window:rect,invert,components:components.length});
 }}}}
 const complete=groups.filter(g=>!groups.some(other=>other!==g&&other.box.width>g.box.width*1.3&&Math.abs(other.box.y-g.box.y)<g.box.height*.2&&other.box.x<=g.box.x+3&&other.box.x+other.box.width>=g.box.x+g.box.width-3));
 const compatible=[];for(const a of complete)for(const b of complete)for(const c of complete){if(a===b||b===c||a===c||a.box.y+a.box.height>b.box.y||b.box.y+b.box.height>c.box.y)continue;const major=(a.box.height+b.box.height)/2,similar=Math.min(a.box.height,b.box.height)/Math.max(a.box.height,b.box.height),right=g=>g.box.x+g.box.width;
 if(similar<.7||c.box.height>major*1.05||c.box.height<major*.35||Math.max(right(a),right(b),right(c))-Math.min(right(a),right(b),right(c))>major*1.2||c.box.y-(a.box.y+a.box.height)>major*5)continue;
 const center=Math.abs(((a.box.x+right(a))/2-area.x)/area.width-.5);compatible.push({a,b,c,score:(a.score+b.score+c.score)/3+.12*similar-.04*center});}
 compatible.sort((a,b)=>b.score-a.score);const best=compatible[0],other=compatible.find(t=>best&&[t.a.value,t.b.value,t.c.value].join('/')!==[best.a.value,best.b.value,best.c.value].join('/'));
 let result={sys:null,dia:null,pulse:null,status:'incomplete'};
 if(best){if(other&&best.score-other.score<.035)result.status='ambiguous';else result={sys:best.a.value,dia:best.b.value,pulse:best.c.value,status:best.a.value>best.b.value?'candidate':'review',groups:[best.a,best.b,best.c]};}
 const mask=binarize(image,options);if(best&&result.groups)for(const row of result.groups){const b=row.box,pad=3,tile=cropRgba(image,{x:b.x-pad,y:b.y-pad,width:b.width+pad*2,height:b.height+pad*2}),m=binarize(tile,{...options,invert:row.invert,preprocessing:'otsu'});for(let y=0;y<tile.height;y++)mask.set(m.subarray(y*tile.width,(y+1)*tile.width),(tile.y+y)*w+tile.x);}
 return {...result,version:VERSION,mask,width:w,height:h,candidates:result.groups??groups,search:'center-out',attempts};
}
