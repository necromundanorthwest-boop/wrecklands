export function validateContent(c) {
  const fail = message => { throw new Error(`Invalid content: ${message}`); };
  const object = (v, fields, optional = []) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail('expected object');
    if (fields.some(k => !Object.hasOwn(v, k)) || Object.keys(v).some(k => !fields.includes(k) && !optional.includes(k))) fail('missing or unknown fields');
  };
  const str = v => { if (typeof v !== 'string' || !v.trim()) fail('empty/non-string identifier or label'); };
  const integer = (v, min, max = Number.MAX_SAFE_INTEGER) => { if (!Number.isSafeInteger(v) || v < min || v > max) fail('number outside range'); };
  const list = (v, count) => { if (!Array.isArray(v) || (count !== undefined && v.length !== count)) fail('content count'); };
  const ids = v => { v.forEach(x => str(x.id)); if (new Set(v.map(x => x.id)).size !== v.length) fail('duplicate IDs'); };
  object(c, ['vehicles','crew','weapons','maneuvers','scenarios','map'], ['version']);
  for (const [key,count] of Object.entries({vehicles:1,crew:3,weapons:1,maneuvers:6,scenarios:1})) { list(c[key],count); ids(c[key]); }
  for (const v of c.vehicles) {
    object(v,['id','name','maxIntegrity','armor','maxSpeed','startingSpeed','maxRisk','startingRisk','crewCapacity','weaponSlots']); str(v.name);
    integer(v.maxIntegrity,1); integer(v.armor,0); integer(v.maxSpeed,3,3); integer(v.startingSpeed,1,v.maxSpeed); integer(v.maxRisk,6,6); integer(v.startingRisk,0,v.maxRisk-1); integer(v.crewCapacity,3,3); integer(v.weaponSlots,1,1);
  }
  for (const v of c.crew) { object(v,['id','name','role','fightTarget','shootTarget','reflexTarget','nerveTarget','maxWounds']); str(v.name); if (!['driver','gunner','boarder'].includes(v.role)) fail('crew role'); for(const k of ['fightTarget','shootTarget','reflexTarget','nerveTarget']) integer(v[k],2,6); integer(v.maxWounds,1); }
  if (new Set(c.crew.map(x=>x.role)).size!==3) fail('duplicate crew roles');
  for (const v of c.weapons) { object(v,['id','name','range','hitTarget','damage','traits']);str(v.name);integer(v.range,1,12);integer(v.hitTarget,2,6);integer(v.damage,1);list(v.traits,0); }
  for (const v of c.maneuvers) {
    object(v,['id','name','minSpeed','maxSpeed','risk','relativePath'],['facingChangeDegrees']);str(v.name);integer(v.minSpeed,1,3);integer(v.maxSpeed,v.minSpeed,3);integer(v.risk,0,6);list(v.relativePath);
    if(!v.relativePath.length) fail('empty path');
    for(const step of v.relativePath) {list(step,2);step.forEach(x=>integer(x,-1,1));if(step.every(x=>x===0)) fail('zero path step');}
    if(v.facingChangeDegrees!==undefined && ![-90,0,90].includes(v.facingChangeDegrees)) fail('rotation');
  }
  const m=c.map;object(m,['id','name','width','height','playerAStart','playerBStart','playerAExtraction','playerBExtraction','scrap','blockedTerrain','losBlockingTerrain']);str(m.id);str(m.name);integer(m.width,12,12);integer(m.height,12,12);
  const coord=(v,extra=[])=>{object(v,['x','y',...extra]);integer(v.x,0,m.width-1);integer(v.y,0,m.height-1);};
  const cells=v=>{list(v);v.forEach(x=>coord(x));if(new Set(v.map(x=>`${x.x},${x.y}`)).size!==v.length)fail('duplicate coordinates');};
  for(const key of ['blockedTerrain','losBlockingTerrain','playerAExtraction','playerBExtraction'])cells(m[key]);
  const blocked=v=>m.blockedTerrain.some(t=>t.x===v.x&&t.y===v.y);
  for(const player of ['A','B']) {const v=m[`player${player}Start`];coord(v,['facing']);if(!['N','E','S','W'].includes(v.facing)||blocked(v))fail('start');const zone=m[`player${player}Extraction`];if(!zone.length||zone.some(v=>blocked(v)||v.x!==(player==='A'?0:11)))fail('extraction');}
  if(m.playerAStart.x===m.playerBStart.x&&m.playerAStart.y===m.playerBStart.y)fail('overlapping starts');
  list(m.scrap,3);ids(m.scrap);m.scrap.forEach(v=>{coord(v,['id']);if(blocked(v))fail('blocked Scrap');});if(new Set(m.scrap.map(v=>`${v.x},${v.y}`)).size!==3)fail('overlapping Scrap');
  for(const s of c.scenarios) {object(s,['id','name','mapId','players','scrapToWin','primaryVictory','alternateVictory','startingPlayer','turnLimit']);str(s.name);if(s.mapId!==m.id||s.players!==2||s.scrapToWin!==3||s.primaryVictory!=='collect_and_extract'||s.alternateVictory!=='disable_opponent'||s.startingPlayer!=='random'||s.turnLimit!==null)fail('scenario/reference');}
  return c;
}
