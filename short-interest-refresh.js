'use strict';

// ONE official FI page request per GitHub Actions run. Fail closed: keep the
// previous snapshot if the HTML format changes or a ticker is unavailable.
// This does not trade or trigger Telegram messages.
const fs=require('fs');
const FI_URL='https://www.fi.se/sv/vara-register/blankningsregistret/';
const FILE='short-interest-history.json';
const LEI={
  'SCA-B.ST':'549300FW5JDRV1IJ0M67',
  'SKF-B.ST':'549300B6HWYEE57O8J84',
};
function clean(s){
  return s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]*>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/\s+/g,' ').trim();
}
function parseFiPage(html) {
  if(typeof html!=='string'||html.length<60) throw new Error('FI HTML saknas');
  const header=clean(html).match(/Aktuella positioner\s+(20\d{2}-\d{2}-\d{2})/i);
  if(!header) throw new Error('FI saknar verifierbart datum för aktuell positionslista');
  const date=header[1];
  if(!Number.isFinite(Date.parse(date+'T00:00:00Z'))) throw new Error('Ogiltigt datum från FI');
  const tr=html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)||[];
  const rows={};
  for(const [ticker,lei] of Object.entries(LEI)){
    let match=null;
    for(const row of tr) {
      if(!row.includes(lei)) continue;
      const cells=[...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
        .map(m=>clean(m[1]));
      const i=cells.findIndex(v=>v.trim()===lei);
      if(i<0||cells.length<i+3) continue;
      const positionDate=cells[i+1],raw=cells[i+2].replace(',','.');
      const shortPct=Number(raw);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(positionDate)
        || !Number.isFinite(Date.parse(positionDate+'T00:00:00Z'))
        || positionDate>date || !Number.isFinite(shortPct)
        || shortPct<0 || shortPct>60)
          throw new Error('FI felaktig positionsdata '+ticker);
      match={shortPct,positionDate};
      break;
    }
    if(!match)throw new Error('Kan inte säkert läsa FI:s tabellrad för '+ticker);
    rows[ticker]=match;
  }
  return {asOfDate:date,sourcePublished:date,source:FI_URL,
    publisher:'Finansinspektionen',rows};
}
async function main() {
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
  let res;
  try {res=await fetch(FI_URL,{signal:controller.signal,headers:{
    'User-Agent':'Mozilla/5.0 (AG Invest research-only daily FI public register reader)',
    'Accept':'text/html'
  }});} finally {clearTimeout(timeout);}
  if(!res.ok)throw new Error('FI HTTP '+res.status);
  const snapshot=parseFiPage(await res.text());
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Stockholm'});
  const lag=(Date.parse(today+'T00:00:00Z')-Date.parse(snapshot.asOfDate+'T00:00:00Z'))/86400000;
  if(lag<0||lag>4) throw new Error('FI visar framtida eller för gammalt listdatum '+snapshot.asOfDate);
  const file=JSON.parse(fs.readFileSync(FILE,'utf8'));
  const old=file.snapshots.find(s=>s.asOfDate===snapshot.asOfDate);
  if(old && JSON.stringify(old.rows)===JSON.stringify(snapshot.rows)) {
    console.log('Samma FI-observation redan lagrad: '+snapshot.asOfDate);
    return;
  }
  file.snapshots=file.snapshots.filter(s=>s.asOfDate!==snapshot.asOfDate);
  file.snapshots.push(snapshot);
  file.snapshots.sort((a,b)=>a.asOfDate.localeCompare(b.asOfDate));
  fs.writeFileSync(FILE,JSON.stringify(file,null,2)+'\n');
  console.log('FI '+snapshot.asOfDate+': '+
    Object.entries(snapshot.rows).map(([ticker,p])=>ticker+' '+p.shortPct+'%').join(' · '));
}
if(require.main===module)main().catch(e=>{console.error('FI-uppdatering stoppad: '+e.message);process.exitCode=1;});
module.exports={parseFiPage};
