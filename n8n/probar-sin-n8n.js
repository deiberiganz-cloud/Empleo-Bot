// Simula el flujo de n8n fuera de n8n: baja los portales, normaliza y guarda data/entrada.json.
const fs=require('fs');
const UA={headers:{'User-Agent':'Mozilla/5.0 (empleo-bot personal)'}};
const Q=['desarrollador','react','node','soporte','atención al cliente','ecommerce','qa','automatización'];
(async()=>{
 const items=[];const add=v=>Array.isArray(v)?v.forEach(x=>items.push({json:x})):items.push({json:v});
 const j=async u=>(await fetch(u,UA)).json();
 add(await j('https://remoteok.com/api')); add(await j('https://remotive.com/api/remote-jobs'));
 add(await j('https://himalayas.app/jobs/api/search?country=AR&limit=100')); add(await j('https://www.workingnomads.com/api/exposed_jobs/'));
 for(const q of Q) add(await j(`https://www.getonbrd.com/api/v0/search/jobs?query=${encodeURIComponent(q)}&per_page=50&remote=true&expand=%5B%22company%22%5D`));
 const rss=await (await fetch('https://weworkremotely.com/remote-jobs.rss',UA)).text();
 for(const m of rss.matchAll(/<item>([\s\S]*?)<\/item>/g)){const g=t=>(m[1].match(new RegExp(`<${t}>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?</${t}>`))||[])[1];add({title:g('title'),link:g('link'),content:g('description'),isoDate:g('pubDate')});}
 try{add(JSON.parse(require('child_process').execFileSync('node',[__dirname+'/leer-alertas.js'],{encoding:'utf8'})));}catch(e){console.error('alertas de Gmail:',e.message);}
 const $input={all:()=>items};
 const out=eval('(()=>{'+fs.readFileSync(__dirname+'/normalizar.js','utf8')+'})()');
 console.log('crudos',items.length,'pasan',out.length);
 const porFuente={};out.forEach(o=>porFuente[o.json.fuente]=(porFuente[o.json.fuente]||0)+1);console.log(porFuente);
 out.slice(0,8).forEach(o=>console.log('-',o.json.fuente,'|',o.json.titulo,'|',o.json.empresa));
 fs.writeFileSync(__dirname+'/../data/entrada.json',JSON.stringify(out.map(o=>o.json)));
})();
