/* Explicit display fields only. Adding an Airtable field still requires an API whitelist mapping. */
(function(root){
  'use strict';
  const missing=/^(?:[-–—]+|n\/?a|null|undefined|미정|미입력|확인\s*(?:필요|중))$/i;
  function text(value){
    if(Array.isArray(value))return value.map(text).filter(Boolean).join(' · ');
    if(typeof value!=='string'&&typeof value!=='number')return '';
    const s=String(value).trim();
    return s&&!missing.test(s)?s:'';
  }
  const fields=[
    ['zone','내한성'],['height','성목 높이'],['spread','성목 너비'],
    ['light','일조'],['soil','토양'],['moisture','수분·배수'],
    ['foliage','잎의 특성'],['flowering','개화 시기']
  ];
  function facts(plant){return fields.map(([key,label])=>({key,label,value:text(plant[key])})).filter(f=>f.value);}
  function matchesVariant(plant,zone,status){return (!zone||text(plant.zone)===zone)&&(!status||plant.status===status);}
  // A single shared 600-character budget for modal, public page and future editor.
  const SUMMARY_LIMIT=600;
  function clip(value,max){if(max<=0)return '';const chars=Array.from(text(value));return chars.length<=max?chars.join(''):chars.slice(0,Math.max(0,max-1)).join('')+'…';}
  function summary(plant){
    const source={...plant}, prose=[];
    const labels={'개화 시기':'flowering','USDA Zone':'zone','USDA 내한성 Zone':'zone','추천 식재 시기':'planting','관리 난이도':'difficulty','태그':'tags'};
    for(const line of text(plant.desc).split(/\r?\n/)){
      const m=line.match(/^\s*([^:：]+)[:：]\s*(.*)$/),key=m&&labels[m[1].trim()];
      if(key){if(key==='tags')source.tags=m[2].split(/[,·]/).map(v=>v.trim()).filter(Boolean);else if(!text(source[key]))source[key]=m[2];}
      else prose.push(line);
    }
    source.desc=prose.join('\n');
    const fields=[['flowering','개화 시기'],['zone','USDA 내한성 Zone'],['planting','추천 식재 시기'],['difficulty','관리 난이도']];
    const facts=fields.map(([key,label])=>({key,label,value:clip(source[key],60)||'미확인'}));
    // Temperature alone is not a USDA zone. Preserve it without inventing a conversion.
    if(text(source.zone)&&!/(?:zone|존)\s*\d/i.test(text(source.zone)))facts[1]={key:'zone',label:'내한성 (등록값)',value:clip(source.zone,60)};
    // 품종 마스터에서 확인된 값만 덧붙입니다. 비어 있으면 줄 자체를 만들지 않습니다(미확인 표시 없음).
    [['height','성목 높이'],['spread','성목 너비'],['series','시리즈'],['award','수상']]
      .forEach(([key,label])=>{const value=clip(source[key],60);if(value)facts.push({key,label,value});});
    const tags=Array.isArray(source.tags)?source.tags.map(v=>clip(v,30)).filter(Boolean).slice(0,4):[];
    const prefix=facts.map(f=>f.label+': '+f.value).concat(tags).join(' · ');
    const description=clip([text(source.desc),text(source.use)].filter(Boolean).join(' · '),Math.max(0,SUMMARY_LIMIT-Array.from(prefix).length-3));
    return {facts,tags,description,text:[prefix,description].filter(Boolean).join(' · ')};
  }
  const api={text,facts,matchesVariant,summary,SUMMARY_LIMIT};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.CatalogInfo=api;
})(typeof window==='undefined'?globalThis:window);
