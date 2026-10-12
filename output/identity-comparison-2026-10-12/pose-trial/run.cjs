// Fixture experiment only. Manual masks are not a production registration model.
const fs=require('node:fs'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {PNG}=require('pngjs');
const cases=[
  ['three-quarter',{cx:.440,cy:.295,rx:.155,ry:.135},-22],
  ['small-face',{cx:.488,cy:.375,rx:.070,ry:.050},0],
  ['expression',{cx:.505,cy:.340,rx:.182,ry:.155},0]
];
const reports=[];
const sheet=new PNG({width:1000,height:1650});sheet.data.fill(255);
for(const [row,[name,target,rotationDegrees]] of cases.entries()){
  const dir=path.join(__dirname,name);
  fs.writeFileSync(path.join(dir,'registration.json'),JSON.stringify({source:{cx:.507,cy:.530,rx:.244,ry:.246},target,rotationDegrees,feather:.14},null,2)+'\n');
  const run=spawnSync(process.execPath,[path.join(__dirname,'../composite.cjs'),dir],{encoding:'utf8'});
  if(run.status!==0)throw Error(run.stderr||run.stdout);
  const report=JSON.parse(fs.readFileSync(path.join(dir,'measurements.json'),'utf8'));
  report.limitations=['Manual 2D affine registration','One original frontal closed-mouth reference; no pose/expression reconstruction','B preserves source expression; incompatible target pose/expression is a failure','Bilinear sampling; not byte-identical to unscaled source','No automated likeness score or parent approval'];
  const scene=PNG.sync.read(fs.readFileSync(path.join(dir,'a-illustrated.png')));
  const actual=PNG.sync.read(fs.readFileSync(path.join(dir,'b-photo-composite.png')));
  let outsideDifferences=0;
  const angle=rotationDegrees*Math.PI/180;
  for(let y=0;y<scene.height;y++)for(let x=0;x<scene.width;x++){
    const dx=x-target.cx*scene.width,dy=y-target.cy*scene.height;
    const radius=Math.hypot((dx*Math.cos(angle)+dy*Math.sin(angle))/(target.rx*scene.width),(-dx*Math.sin(angle)+dy*Math.cos(angle))/(target.ry*scene.height));
    const i=(y*scene.width+x)*4;
    if(radius>=1&&!scene.data.subarray(i,i+4).equals(actual.data.subarray(i,i+4)))outsideDifferences++;
  }
  report.decodedOutsideDifferences=outsideDifferences;
  if(outsideDifferences)throw Error('Saved PNG modified outside mask');
  fs.writeFileSync(path.join(dir,'measurements.json'),JSON.stringify(report,null,2)+'\n');
  reports.push({case:name,...report});
  for(const [col,img] of [scene,actual].entries()){
    const scale=Math.min(500/img.width,550/img.height);
    const w=Math.floor(img.width*scale),h=Math.floor(img.height*scale),left=col*500+Math.floor((500-w)/2);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const src=(Math.floor(y/scale)*img.width+Math.floor(x/scale))*4;
      const dest=((row*550+y)*sheet.width+left+x)*4;
      img.data.copy(sheet.data,dest,src,src+4);
    }
  }
}
fs.writeFileSync(path.join(__dirname,'comparison.png'),PNG.sync.write(sheet));
fs.writeFileSync(path.join(__dirname,'measurements.json'),JSON.stringify(reports,null,2)+'\n');
console.log(reports.map(r=>({case:r.case,outsideDifferences:r.decodedOutsideDifferences,interiorPixels:r.copiedInterior})));
