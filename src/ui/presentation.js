import { crewAvailable } from '../rules/activation.js';
import { distance, lineOfSight, adjacent, other, pushCell, freeCell } from '../rules/geometry.js';
import { ramReason } from '../rules/gameplay.js';
const speeds = ['', 'Crawl', 'Cruise', 'Full Throttle'];
const title = value => String(value ?? '').replaceAll('_', ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
const node = (tag, text, className) => { const e = document.createElement(tag); e.textContent = text; if (className) e.className = className; return e; };
export function phaseText(s, player, pending, selected) {
  if (s.status === 'finished') return {title:`Player ${s.winner} wins`,instruction:'Match finished. Return to lobby to start another game.'};
  if (s.status === 'waiting') return {title:'Waiting for Player B',instruction:'Share the room code. Play starts when the second player joins.'};
  const own = s.activePlayer === player;
  if (own && pending) return {title:pending.intent.type === 'MOVE' ? 'Confirming movement…' : 'Resolving your choice…',instruction:'Waiting for the shared result. Retrying will not repeat the effect.'};
  if (s.activation.phase === 'action') return {title:own?'Your turn · choose an action':`Player ${s.activePlayer} · choosing an action`,instruction:own?'Choose one legal action. Required crew and targets are shown below.':'Watch the latest result for the opponent’s committed action.'};
  return {title:own?'Your turn · movement':`Player ${s.activePlayer} · ${s.activation.speedChanged?'choosing a maneuver':'choosing Speed / maneuver'}`,instruction:own?(selected?'Review the path. Confirm to move, or clear the preview to reconsider.':'Optional Speed change → preview maneuver → confirm movement.'): `Waiting for Player ${s.activePlayer} to choose ${s.activation.speedChanged?'a maneuver':'Speed / maneuver'}. Their preview is private.`};
}
export function renderConditions(vehicles, crews, s, c, player) {
  vehicles.replaceChildren(); crews.replaceChildren();
  for (const p of ['A','B']) {
    const v=s.vehicles[p], card=node('section','',`condition player-card-${p}`);
    card.append(node('strong',`Player ${p}${p===player?' · YOU':''}${s.activePlayer===p&&s.status==='playing'?' · ACTIVE':''}`));
    card.append(node('div',`Integrity ${v.integrity}/${c.vehicles[0].maxIntegrity}${v.disabled?' · DISABLED':''} · ${speeds[v.speed]} (${v.speed})`));
    card.append(node('div',`Risk ${v.risk}/6 · Scrap ${v.scrapCarried}/3${v.scrapCarried>=3?' · EXTRACT NOW':''}`,v.risk>=4?'risk-warning':''));
    const meter=document.createElement('meter');meter.min=0;meter.max=6;meter.value=v.risk;meter.setAttribute('aria-label',`Player ${p} Risk ${v.risk} of 6`);card.append(meter);
    card.append(node('small',`(${v.position.x}, ${v.position.y}) · Facing ${v.facing} · Extraction: ${p==='A'?'left':'right'} edge`));vehicles.append(card);
    const crewCard=node('section','',`crew-card player-card-${p}`);
    for(const crew of Object.values(s.crew).filter(x=>x.owner===p)) {
      const where=crew.location==='enemy_vehicle'?'ABOARD ENEMY':crew.location==='off_vehicle'?'OFF VEHICLE': 'aboard own vehicle';
      crewCard.append(node('div',`${p} ${title(crew.role)} · ${crew.wounds} Wounds · ${crew.wounds===0?'UNAVAILABLE':where}`,crew.location==='enemy_vehicle'?'boarded':''));
    }
    crews.append(crewCard);
  }
}
export function actionLabel(action, state, player, content) {
  const attribute = {ATTACK_DRIVER:'fightTarget', ATTACK_GUNNER:'fightTarget', SABOTAGE:'reflexTarget', STEAL_SCRAP:'reflexTarget'}[action.type];
  if (!attribute) return action.label;
  const boarder = Object.values(state.crew).find(crew => crew.owner === player && crew.role === 'boarder');
  const definition = content.crew.find(crew => crew.id === boarder?.definitionId);
  return `${action.label} — ${attribute === 'fightTarget' ? 'Fight' : 'Reflex'} ${definition[attribute]}+`;
}
export function actionHint(action,payload,s,p,c,fallback) {
  const crew=Object.values(s.crew).find(x=>x.owner===p&&x.role==='boarder');
  const required={SHOOT:'Gunner',BOARD:'Boarder',REPAIR:'Driver',ATTACK_DRIVER:'Boarder',ATTACK_GUNNER:'Boarder',SABOTAGE:'Boarder',STEAL_SCRAP:'Boarder',JUMP_OFF:'Boarder'}[action.type];
  const prefix=required?`${required} required. `:'No crew requirement. ';
  if(s.activePlayer!==p)return prefix+'Available during your action phase.';
  if(!payload) {
    if(action.type==='SHOOT') return prefix+(!crewAvailable(s,p,'gunner')?'Gunner unavailable.':distance(s.vehicles[p].position,s.vehicles[other(p)].position)>c.weapons[0].range?'Enemy beyond range 6.':!lineOfSight(s.vehicles[p].position,s.vehicles[other(p)].position,c.map)?'Terrain blocks line of sight.':action.reason);
    if(action.type==='RAM')return prefix+(ramReason(s,p)||action.reason);
    if(action.type==='BOARD')return prefix+(!crewAvailable(s,p,'boarder')?'Boarder unavailable aboard your vehicle.':!adjacent(s.vehicles[p].position,s.vehicles[other(p)].position)?'Enemy must be adjacent.':action.reason);
    if(required==='Boarder'&&crew?.wounds===0)return prefix+'Boarder has no Wounds remaining.';
    return prefix+action.reason;
  }
  let target=payload.targetCrewId?`Target: enemy ${action.type==='ATTACK_DRIVER'?'Driver':'Gunner'}. `:payload.targetId?'Target: enemy vehicle. ':'';
  if(action.type==='REPAIR') target='Remove 2 Risk (minimum 0); no Integrity repair. ';
  if(action.type==='SHOOT')target+=`Scrap Rifle · range ${c.weapons[0].range} · ${c.weapons[0].hitTarget}+. `;
  if(['ATTACK_DRIVER','ATTACK_GUNNER'].includes(action.type))target+='Success: target loses 1 Wound (minimum 0). ';
  if(action.type==='SABOTAGE')target+='Success: 1 Integrity damage +1 Risk. ';
  if(action.type==='STEAL_SCRAP')target+='Success: Scrap transfers to your vehicle. ';
  if(action.type==='JUMP_OFF')target+=adjacent(s.vehicles[p].position,s.vehicles[other(p)].position)?'Return to your adjacent vehicle. ':'Leave the match permanently: your vehicle is not adjacent. ';
  return prefix+target+fallback;
}
export function eventText(event) {
  let text=`Turn ${event.turn} · ${event.actingPlayer?`Player ${event.actingPlayer}`:'Match'} · ${title(event.actionType)}: ${event.outcome}`;
  if(event.actor) text+=` · Actor: ${title(event.actor)}`;
  if(event.target) text+=` · Target: ${title(event.target)}`;
  for(const r of event.rolls??[]) text+=` | ${title(r.kind)}: D6 ${r.roll}${r.targetNumber==null?'':` / ${r.targetNumber}+ → ${r.success?'success':'failure'}`}${r.impactScore===undefined?'':` (Impact ${r.impactScore})`}${r.outcome?` — ${r.outcome}`:''}`;
  for(const p of ['A','B']) {
    const change=event.effects?.vehicles, before=change?.before?.[p], after=change?.after?.[p];
    if(!before||!after)continue;
    const bits=[];
    if(before.integrity!==after.integrity)bits.push(`Integrity ${before.integrity} → ${after.integrity}${after.disabled?' · DISABLED':''}`);
    if(before.risk!==after.risk)bits.push(`Risk ${before.risk} → ${after.risk}`);
    if(before.scrapCarried!==after.scrapCarried)bits.push(`Scrap ${before.scrapCarried} → ${after.scrapCarried}`);
    if(before.position.x!==after.position.x||before.position.y!==after.position.y)bits.push(`position (${after.position.x}, ${after.position.y})`);
    if(before.facing!==after.facing)bits.push(`facing ${after.facing}`);
    if(bits.length)text+=` | ${p}: ${bits.join('; ')}`;
  }
  if(event.rolls?.some(r=>r.kind==='LOSS_OF_CONTROL'))text+=' | Loss of Control resolved; Risk returns to 3.';
  return text;
}
let lastRoom, lastEvent, effectUntil=0;
export function presentEvent(svg,s) {
  const e=s.lastEvent;
  if(lastRoom!==s.roomId){lastRoom=s.roomId;lastEvent=e?.id;return;}
  if(!e)return;
  const fresh=e.id!==lastEvent;
  if(fresh){lastEvent=e.id;effectUntil=performance.now()+650;}
  if(performance.now()>effectUntil)return;
  const kind=e.actionType.toLowerCase();
  if(fresh){svg.classList.remove('fx-shoot','fx-ram','fx-board','fx-scavenge','fx-loss');void svg.getBoundingClientRect();svg.classList.add(e.rolls?.some(r=>r.kind==='LOSS_OF_CONTROL')?'fx-loss':`fx-${kind}`);}
  const target=e.actingPlayer==='A'?'B':'A';
  const group=svg.querySelector(`[data-vehicle="${target}"]`);
  if(['SHOOT','RAM','BOARD'].includes(e.actionType)) {
    const ring=document.createElementNS('http://www.w3.org/2000/svg','circle');
    const p=s.vehicles[target].position;
    for(const [k,v] of Object.entries({cx:p.x*40+40,cy:p.y*40+40,r:23,class:`result-ring result-${kind}`}))ring.setAttribute(k,v);
    svg.append(ring);
    const before=e.effects?.vehicles?.before ?? s.vehicles;
    const origin=before[e.actingPlayer]?.position;
    if(origin && ['SHOOT','BOARD'].includes(e.actionType)) {
      const line=document.createElementNS('http://www.w3.org/2000/svg','path');
      line.setAttribute('d',`M${origin.x*40+40},${origin.y*40+40}L${p.x*40+40},${p.y*40+40}`);
      line.setAttribute('class',`result-trail trail-${kind}`);svg.append(line);
    }
    if(e.actionType==='RAM')for(let i=0;i<6;i++){const spark=document.createElementNS('http://www.w3.org/2000/svg','path');const angle=i*Math.PI/3,cx=p.x*40+40,cy=p.y*40+40;spark.setAttribute('d',`M${cx+Math.cos(angle)*18},${cy+Math.sin(angle)*18}l${Math.cos(angle)*12},${Math.sin(angle)*12}`);spark.setAttribute('class','ram-spark');svg.append(spark);}
    group?.classList.add('received-result');
  }
}
export function targetPreview(svg,s,p,type,payload,c) {
  svg.querySelectorAll('.target-preview').forEach(e=>e.remove());
  if(!payload||!['SHOOT','RAM','BOARD'].includes(type))return;
  const target=s.vehicles[other(p)],ns='http://www.w3.org/2000/svg';
  const mark=(cell,label)=>{const g=document.createElementNS(ns,'g');g.setAttribute('class','target-preview');const rect=document.createElementNS(ns,'rect');for(const[k,v]of Object.entries({x:cell.x*40+22,y:cell.y*40+22,width:36,height:36,rx:5}))rect.setAttribute(k,v);g.append(rect);const t=document.createElementNS(ns,'text');t.setAttribute('x',cell.x*40+40);t.setAttribute('y',cell.y*40+18);t.textContent=label;g.append(t);svg.append(g);};
  if(type==='RAM') { const cell=pushCell(s.vehicles[p],target); if(cell.x>=0&&cell.x<12&&cell.y>=0&&cell.y<12)mark(cell,freeCell(s,other(p),cell,c)?'IF PUSH':'BLOCKED +1 RISK'); }
  mark(target.position,type==='BOARD'?'BOARD 4+':type==='SHOOT'?`SHOOT ${c.weapons[0].hitTarget}+`:'RAM');
}
export function renderSummary(root,s,leave) {
  root.replaceChildren(node('h2',`Player ${s.winner} wins`),node('p',`${title(s.victoryReason)} · ${s.summary.turns} turns / ${s.summary.activations} activations.`));
  const table=document.createElement('table'),head=document.createElement('tr');
  for(const label of['Player','Scrap collected','Vehicle damage dealt','Boarding successes / attempts'])head.append(node('th',label));table.append(head);
  for(const p of ['A','B']){const row=document.createElement('tr'),x=s.summary.players[p];for(const value of[p,x.scrapCollected,x.damageDealt,`${x.successfulBoardingAttempts} / ${x.boardingAttempts}`])row.append(node('td',value));table.append(row);}
  const button=node('button','Return to lobby / new game','primary');button.onclick=leave;root.append(table,button);
}
