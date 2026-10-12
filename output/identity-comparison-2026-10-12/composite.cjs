// Synthetic-fixture experiment: manually registered face, no model or face detector.
const fs = require('node:fs');
const { PNG } = require('pngjs');
const path = require('node:path');
const targetDir = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const read = name => PNG.sync.read(fs.readFileSync(path.join(name === 'reference.png' ? __dirname : targetDir, name)));
const source = read('reference.png');
const scene = read('a-illustrated.png');
const result = new PNG({width:scene.width,height:scene.height});
result.data = Buffer.from(scene.data);
// Normalised coordinates measured visually on this fixture, not general landmarks.
const registration = process.argv[2] ? JSON.parse(fs.readFileSync(path.join(targetDir,'registration.json'),'utf8')) : { source: {cx:.507,cy:.530,rx:.244,ry:.246}, target:{cx:.510,cy:.234,rx:.111,ry:.094}, feather:.14 };
let changedOutside = 0, copiedInterior = 0, interiorMismatch = 0;
for(let y=0;y<scene.height;y++) for(let x=0;x<scene.width;x++) {
  const offsetX=x-registration.target.cx*scene.width;
  const offsetY=y-registration.target.cy*scene.height;
  const angle=(registration.rotationDegrees || 0)*Math.PI/180;
  const u=(offsetX*Math.cos(angle)+offsetY*Math.sin(angle))/(registration.target.rx*scene.width);
  const v=(-offsetX*Math.sin(angle)+offsetY*Math.cos(angle))/(registration.target.ry*scene.height);
  const radius=Math.hypot(u,v);
  const i=(y*scene.width+x)*4;
  if(radius<1){
    const sx=(registration.source.cx+u*registration.source.rx)*source.width;
    const sy=(registration.source.cy+v*registration.source.ry)*source.height;
    const x0=Math.max(0,Math.min(source.width-2,Math.floor(sx)));
    const y0=Math.max(0,Math.min(source.height-2,Math.floor(sy)));
    const dx=sx-x0,dy=sy-y0;
    const alpha=Math.min(1,(1-radius)/registration.feather);
    for(let c=0;c<3;c++){
      const at=(px,py)=>source.data[(py*source.width+px)*4+c];
      const sample=(at(x0,y0)*(1-dx)+at(x0+1,y0)*dx)*(1-dy)+(at(x0,y0+1)*(1-dx)+at(x0+1,y0+1)*dx)*dy;
      result.data[i+c]=Math.round(sample*alpha+scene.data[i+c]*(1-alpha));
      if(alpha===1 && result.data[i+c]!==Math.round(sample)) interiorMismatch++;
    }
    if(alpha===1) copiedInterior++;
  } else if(!result.data.subarray(i,i+4).equals(scene.data.subarray(i,i+4))) changedOutside++;
}
fs.writeFileSync(path.join(targetDir,'b-photo-composite.png'),PNG.sync.write(result));
const report={synthetic:true,sourceSize:[source.width,source.height],sceneSize:[scene.width,scene.height],registration,changedOutside,copiedInterior,interiorMismatch,limitations:['Manual registration for one frontal pose','Bilinear scaling changes source pixel sampling; no generative face redraw','No automated likeness score or parent approval','Not a production provider comparison']};
fs.writeFileSync(path.join(targetDir,'measurements.json'),JSON.stringify(report,null,2)+'\n');
if(changedOutside || interiorMismatch) throw Error('Preservation invariant failed');
console.log(JSON.stringify(report));
