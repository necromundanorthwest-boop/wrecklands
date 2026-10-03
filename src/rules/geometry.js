export const directions = { N: {x:0,y:-1}, E:{x:1,y:0}, S:{x:0,y:1}, W:{x:-1,y:0} };
export const other = p => p==='A'?'B':'A';
export const sameCell = (a,b) => a.x===b.x&&a.y===b.y;
export const distance = (a,b) => Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export const adjacent = (a,b) => distance(a,b)===1;
export function freeCell(s,p,cell,c) { return cell.x>=0&&cell.y>=0&&cell.x<c.map.width&&cell.y<c.map.height&&!c.map.blockedTerrain.some(t=>sameCell(t,cell))&&!sameCell(s.vehicles[other(p)].position,cell); }
export function forwardArc(v,target) { const d=directions[v.facing];return adjacent(v.position,target)&&(target.x-v.position.x)*d.x+(target.y-v.position.y)*d.y===1; }
export function pushCell(attacker,defender) { const dx=defender.position.x-attacker.position.x,dy=defender.position.y-attacker.position.y;const d=Math.abs(dx)===Math.abs(dy)?directions[attacker.facing]:Math.abs(dx)>Math.abs(dy)?{x:Math.sign(dx),y:0}:{x:0,y:Math.sign(dy)};return {x:defender.position.x+d.x,y:defender.position.y+d.y}; }
export function rotate(facing,step) { const f=['N','E','S','W'];return f[(f.indexOf(facing)+step+4)%4]; }
export function lineOfSight(a,b,map) {
  for(const cell of map.losBlockingTerrain) {
    let low=0,high=1;
    for(const axis of ['x','y']) {
      const delta=b[axis]-a[axis],min=cell[axis]-.5,max=cell[axis]+.5;
      if(delta===0) { if(a[axis]<=min||a[axis]>=max){high=-1;break;} }
      else {const u=(min-a[axis])/delta,v=(max-a[axis])/delta;low=Math.max(low,Math.min(u,v));high=Math.min(high,Math.max(u,v));}
    }
    if(high-low>1e-10)return false;
  }
  return true;
}
