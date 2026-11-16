import { preview } from 'vite';
const index=process.argv.indexOf('--port');
const port=index<0?5173:Number(process.argv[index+1]);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('Use a valid --port number.');
const server=await preview({configFile:false,root:'frontend',base:'./',build:{outDir:'../dist'},preview:{host:'127.0.0.1',port,strictPort:true}});
server.printUrls();
