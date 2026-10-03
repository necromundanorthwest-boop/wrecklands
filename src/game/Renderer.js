const ns = 'http://www.w3.org/2000/svg';
function element(tag, attrs, text) {
  const node = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}
const size = 40;
const center = p => [p.x * size + 40, p.y * size + 40];

export function renderBoard(svg, state, content, preview) {
  svg.replaceChildren();
  svg.append(element('title', {}, 'Scrapyard 01: twelve by twelve battlefield'));
  for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) svg.append(element('rect', { x: x * size + 20, y: y * size + 20, width: size, height: size, class: 'grid-cell', 'data-cell': `${x},${y}` }));
  for (let n = 0; n < 12; n++) {
    svg.append(element('text', { x: n * size + 40, y: 13, class: 'coordinate' }, String(n)));
    svg.append(element('text', { x: 9, y: n * size + 44, class: 'coordinate' }, String(n)));
  }
  for (const player of ['A', 'B']) for (const p of content.map[`player${player}Extraction`]) {
    const [x, y] = center(p); svg.append(element('rect', { x: x - 18, y: y - 18, width: 36, height: 36, class: `extraction player-${player}` }));
  }
  for (const p of content.map.blockedTerrain) {
    const [x, y] = center(p);
    svg.append(element('rect', { x: x - 17, y: y - 17, width: 34, height: 34, class: 'terrain' }));
    svg.append(element('path', { d: `M${x - 12},${y - 12}L${x + 12},${y + 12}M${x + 12},${y - 12}L${x - 12},${y + 12}`, class: 'terrain-cross' }));
  }
  for (const p of Object.values(state.scrap)) {
    const [x, y] = center(p); svg.append(element('path', { d: `M${x},${y - 10}L${x + 10},${y}L${x},${y + 10}L${x - 10},${y}Z`, class: 'scrap', 'data-scrap': p.id }));
  }
  if (preview) {
    const origin = state.vehicles[state.activePlayer].position;
    const points = [origin, ...preview.path].map(p => center(p).join(',')).join(' ');
    svg.append(element('polyline', { points, class: 'preview-path', 'data-testid': 'preview-path' }));
    const [x, y] = center(preview.destination);
    svg.append(element('rect', { x: x - 18, y: y - 18, width: 36, height: 36, class: 'preview-destination', 'data-testid': 'preview-destination' }));
    const rotation = { N: 0, E: 90, S: 180, W: 270 }[preview.facing];
    svg.append(element('path', { d: `M${x - 7},${y + 6}L${x},${y - 9}L${x + 7},${y + 6}`, transform: `rotate(${rotation} ${x} ${y})`, class: 'preview-arrow', 'data-testid': 'preview-facing' }));
  }
  for (const [player, vehicle] of Object.entries(state.vehicles)) {
    const [x, y] = center(vehicle.position);
    const rotation = { N: 0, E: 90, S: 180, W: 270 }[vehicle.facing];
    const group = element('g', { class: `vehicle player-${player}`, 'data-vehicle': player, 'data-position': `${vehicle.position.x},${vehicle.position.y}`, 'data-facing': vehicle.facing });
    for (const side of [-1, 1]) for (const offset of [-8, 9]) group.append(element('rect', { x: x + side * 15 - 3, y: y + offset - 5, width: 6, height: 10, rx: 2, class: 'wheel', transform: `rotate(${rotation} ${x} ${y})` }));
    group.append(element('path', { d: `M${x - 13},${y + 14}L${x - 13},${y - 8}L${x},${y - 18}L${x + 13},${y - 8}L${x + 13},${y + 14}Z`, transform: `rotate(${rotation} ${x} ${y})` }));
    group.append(element('text', { x, y: y + 5 }, player));
    if(vehicle.integrity<=3) group.append(element('path',{d:`M${x-7},${y+10}l5,-8l4,7l5,-4`,class:'damage-mark'}));
    if(vehicle.disabled) group.append(element('text',{x,y:y-24,class:'map-status'},'DISABLED'));
    if(Object.values(state.crew).some(c=>c.owner!==player&&c.location==='enemy_vehicle'&&c.wounds>0)) group.append(element('text',{x,y:y+31,class:'map-status'},'BOARDED'));
    svg.append(group);
  }
}
