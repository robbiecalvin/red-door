import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export function writePwaBuild(directory='dist') {
  const walk=(dir,prefix='')=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?walk(path.join(dir,entry.name),prefix+entry.name+'/'):[prefix+entry.name]);
  const files=walk(directory).filter(file=>file.startsWith('assets/')||file.startsWith('icons/')||['offline.html','offline.js','manifest.webmanifest'].includes(file)).sort();
  for(const file of ['offline.html','offline.js','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/maskable-512.png','icons/apple-touch-icon.png'])if(!files.includes(file))throw Error('Missing PWA build asset: '+file);
  const worker=fs.readFileSync(path.join(directory,'sw.js'),'utf8');
  const hash=crypto.createHash('sha256').update(worker);
  for(const file of files)hash.update(file).update(fs.readFileSync(path.join(directory,file)));
  const version=hash.digest('hex').slice(0,16);
  fs.writeFileSync(path.join(directory,'sw.js'),worker.replace('__RED_DOOR_BUILD__',version).replace('/*__RED_DOOR_PUBLIC_FILES__*/[]',JSON.stringify(files.map(file=>'./'+file))));
  console.log(`PWA public build ${version}: ${files.length} static files; private data excluded.`);
}
