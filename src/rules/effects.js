import { freeCell, directions, rotate, other, sameCell } from './geometry.js';
export function die(ctx,kind,target=null) {const value=ctx.roll();if(!Number.isInteger(value)||value<1||value>6)throw new Error('Authoritative D6 source returned invalid value');const record={kind,roll:value,targetNumber:target,success:target===null?null:value>=target};ctx.rolls.push(record);return record;}
export function damage(s,target,amount,source=null) {
 const v=s.vehicles[target];const applied=Math.min(v.integrity,Math.max(0,amount));v.integrity-=applied;v.disabled=v.integrity===0;
 if(source&&source!==target)s.summary.players[source].damageDealt+=applied;
 return applied;
}
export function addRisk(s,player,amount,c,ctx,source=null) {
 const v=s.vehicles[player];v.risk+=amount;
 if(v.risk<6||ctx.lossResolving.has(player))return;
 ctx.lossResolving.add(player);
 const record=die(ctx,'LOSS_OF_CONTROL');const roll=record.roll;
 if(roll<=2) {const f=directions[v.facing],side=roll===1?-1:1;const cell={x:v.position.x-f.y*side,y:v.position.y+f.x*side};if(freeCell(s,player,cell,c)){v.position=cell;record.outcome=`Player ${player} skids ${roll===1?'left':'right'}`;}else{damage(s,player,1,source);record.outcome=`Player ${player} blocked skid: 1 Integrity lost`;}}
 else if(roll<=4){v.facing=rotate(v.facing,roll===3?-1:1);record.outcome=`Player ${player} spins ${roll===3?'left':'right'}`;}
 else if(roll===5){v.speed=1;record.outcome=`Player ${player} stalls to Crawl`;}
 else{damage(s,player,1,source);record.outcome=`Player ${player} impact: 1 Integrity lost`;}
 v.risk=3;
 ctx.lossResolving.delete(player);
}
export function evaluateVictory(s,c) {
 if(s.winner!==null)return;
 for(const p of ['A','B']) if(s.vehicles[p].integrity===0){s.winner=other(p);s.victoryReason='vehicle_destruction';break;}
 if(s.winner===null)for(const p of ['A','B'])if(s.vehicles[p].scrapCarried>=c.scenarios[0].scrapToWin&&c.map[`player${p}Extraction`].some(cell=>sameCell(cell,s.vehicles[p].position))){s.winner=p;s.victoryReason='scrap_extraction';break;}
 if(s.winner!==null){s.status='finished';s.activation.phase='finished';}
}
