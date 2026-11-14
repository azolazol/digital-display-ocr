import {recognizeCentered,recognizeDisplay} from './engine.js';
self.onmessage=({data})=>{try{self.postMessage({result:(data.center?recognizeCentered:recognizeDisplay)(data.image,data.options)});}catch(e){self.postMessage({error:e.message});}};
