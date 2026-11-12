import test from 'node:test';import assert from 'node:assert/strict';
import {lineToRoi,removeBorderLines,binarize,renderDigit,matchGlyph,readRow,assignFields,recognizeDisplay,validateProfile} from '../src/engine.js';
export function fixture(values=['107','81','80']){const width=300,height=300,data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=(y*width+x)*4;data.set([200+Math.round(y*.08),215,198,255],p);}const rects=[];for(let row=0;row<3;row++){const dh=row===2?42:60,dw=Math.round(dh*.55),gap=10,y=[20,112,212][row],total=values[row].length*(dw+gap)-gap,x0=240-total;rects.push({x:x0-8,y:y-8,width:total+16,height:dh+16});for(let i=0;i<values[row].length;i++){const m=renderDigit(Number(values[row][i]),dw,dh);for(let yy=0;yy<dh;yy++)for(let xx=0;xx<dw;xx++)if(m[yy*dw+xx])data.set([20,26,22,255],((y+yy)*width+x0+i*(dw+gap)+xx)*4);}}return {image:{width,height,data},rects};}
for(let d=0;d<10;d++)test('template '+d,()=>assert.equal(matchGlyph(renderDigit(d)).digit,d));
test('blank does not match',()=>assert.equal(matchGlyph(new Uint8Array(1536)).digit,null));
test('invalid custom template rejected',()=>assert.throws(()=>validateProfile([{digit:11,mask:[]}])));
test('pulse numeric value is not treated as systolic',()=>{const make=(value,y,height)=>({value,box:{x:0,y,width:50,height},score:.9});const r=assignFields([make(110,0,50),make(70,70,50),make(130,145,35)]);assert.equal(r.sys,110);assert.equal(r.dia,70);assert.equal(r.pulse,130);});
test('SYS/DIA are not silently swapped by numeric size',()=>{const make=(value,y,height)=>({value,box:{x:0,y,width:50,height},score:.9});const r=assignFields([make(80,0,50),make(110,70,50),make(70,145,35)]);assert.equal(r.sys,80);assert.equal(r.status,'review');});
test('missing row rejected',()=>assert.equal(assignFields([]).status,'incomplete'));
test('full synthetic display',()=>{const {image}=fixture();const r=recognizeDisplay(image,{radius:10});assert.deepEqual([r.sys,r.dia,r.pulse],[107,81,80]);});
test('same template assigned conflicting labels stays ambiguous',()=>{const m=renderDigit(8);const profile=[{digit:2,mask:Array.from(m)},{digit:3,mask:Array.from(m)}];assert.equal(matchGlyph(m,{profile}).digit,null);});
test('explicit field boxes preserve user labels',()=>{const {image,rects}=fixture();const r=recognizeDisplay(image,{radius:10,fieldRois:{sys:rects[0],dia:rects[1],pulse:rects[2]}});assert.deepEqual([r.sys,r.dia,r.pulse],[107,81,80]);});
test('missing explicit systolic box does not move other rows',()=>{const {image,rects}=fixture();const r=recognizeDisplay(image,{radius:10,fieldRois:{dia:rects[1],pulse:rects[2]}});assert.deepEqual([r.sys,r.dia,r.pulse],[null,81,80]);});
test('crop cutting through a glyph returns no measurement',()=>{const {image,rects}=fixture();const r=recognizeDisplay(image,{radius:10,fieldRois:{sys:{...rects[0],y:30,height:48},dia:rects[1],pulse:rects[2]}});assert.equal(r.sys,null);assert.equal(r.status,'incomplete');});
test('flat image is not interpreted as numbers',()=>{const r=recognizeDisplay({width:120,height:120,data:new Uint8ClampedArray(120*120*4).fill(255)});assert.equal(r.status,'incomplete');});


// A wide LCD stroke used to lose its centre with the 2.5% closing radius.
function wideStroke({invert=false}={}){const width=400,height=500,data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){let v=(x>=100&&x<150&&y>=80&&y<400)?35:100+y*.04;if(invert)v=255-v;data.set([v,v,v,255],(y*width+x)*4);}return {width,height,data};}
test('large dark LCD stroke retains its interior under uneven illumination',()=>{const im=wideStroke(),m=binarize(im);for(let y=110;y<370;y++)for(let x=105;x<145;x++)assert.equal(m[y*im.width+x],1);assert.equal(m[250*im.width+220],0);});
test('large bright LCD stroke retains its interior with inverted polarity',()=>{const im=wideStroke({invert:true}),m=binarize(im,{invert:true});assert.equal(m[250*im.width+125],1);assert.equal(m[250*im.width+220],0);});
test('global brightness alternative retains broad strokes',()=>{const im=wideStroke(),m=binarize(im,{preprocessing:'otsu'});assert.equal(m[250*im.width+125],1);assert.equal(m[250*im.width+220],0);});
test('default preprocessing reads synthetic display without radius override',()=>{const {image}=fixture();const r=recognizeDisplay(image);assert.deepEqual([r.sys,r.dia,r.pulse],[107,81,80]);});

test('thin edge border is removed without removing central digit ink',()=>{const w=100,h=100,m=new Uint8Array(w*h);for(let y=0;y<h;y++)m[y*w+99]=1;for(let y=20;y<70;y++)for(let x=50;x<60;x++)m[y*w+x]=1;removeBorderLines(m,w,h);assert.equal(m[50*w+99],0);assert.equal(m[50*w+55],1);});
test('substantial clipped glyph is retained for crop-edge rejection',()=>{const w=100,h=100,m=new Uint8Array(w*h);for(let y=0;y<60;y++)for(let x=30;x<50;x++)m[y*w+x]=1;removeBorderLines(m,w,h);assert.equal(m[30*w+40],1);});

test('three line gestures select whole rows from original pixels',()=>{const {image}=fixture(),mask=binarize(image);const fieldRois={};for(const [key,y,x]of [['sys',50,130],['dia',140,175],['pulse',233,190]]){fieldRois[key]=lineToRoi(mask,300,300,[{x,y},{x:232,y}]);assert.ok(fieldRois[key]);}const r=recognizeDisplay(image,{fieldRois});assert.deepEqual([r.sys,r.dia,r.pulse],[107,81,80]);});
test('tap or blank line does not invent a selected row',()=>{assert.equal(lineToRoi(new Uint8Array(300*300),300,300,[{x:30,y:30},{x:200,y:30}]),null);assert.equal(lineToRoi(new Uint8Array(300*300),300,300,[{x:30,y:30},{x:31,y:30}]),null);});
