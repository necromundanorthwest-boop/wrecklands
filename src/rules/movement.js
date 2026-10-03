export const FACINGS = ['N', 'E', 'S', 'W'];
const FORWARD = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const same = (a, b) => a.x === b.x && a.y === b.y;

export function projectManeuver(vehicle, maneuver) {
  const [fx, fy] = FORWARD[vehicle.facing];
  const [rx, ry] = [-fy, fx];
  let { x, y } = vehicle.position;
  const path = maneuver.relativePath.map(([right, forward]) => {
    x += right * rx + forward * fx;
    y += right * ry + forward * fy;
    return { x, y };
  });
  const rotation = (maneuver.facingChangeDegrees ?? 0) / 90;
  return {
    path,
    destination: path.at(-1),
    facing: FACINGS[(FACINGS.indexOf(vehicle.facing) + rotation + 4) % 4],
    riskCost: maneuver.risk,
  };
}

export function movementOption(state, player, maneuverId, content) {
  const maneuver = content.maneuvers.find(m => m.id === maneuverId);
  const vehicle = state.vehicles[player];
  if (!maneuver || !vehicle) return { legal: false, reason: 'Unknown maneuver or vehicle.' };
  const preview = projectManeuver(vehicle, maneuver);
  const reject = reason => ({ ...preview, legal: false, reason });
  if (state.status !== 'playing') return reject(state.status === 'finished' ? 'Match finished.' : 'Waiting for a second player.');
  if (state.activePlayer !== player) return reject(`Waiting for Player ${state.activePlayer}.`);
  if (state.activation.phase !== 'movement') return reject('Movement is already confirmed. Choose a legal action.');
  if (vehicle.disabled) return reject('This vehicle is unavailable.');
  if (!Object.values(state.crew).some(c => c.owner === player && c.role === 'driver' && c.wounds > 0 && c.location === 'own_vehicle')) return reject('Driver unavailable; movement advances automatically.');
  if (vehicle.speed < maneuver.minSpeed || vehicle.speed > maneuver.maxSpeed) return reject(`Requires speed ${maneuver.minSpeed}–${maneuver.maxSpeed}.`);
  const map = content.map;
  const opponent = state.vehicles[player === 'A' ? 'B' : 'A'];
  const cellError = cell => {
    if (cell.x < 0 || cell.y < 0 || cell.x >= map.width || cell.y >= map.height) return 'Path leaves the battlefield.';
    if (map.blockedTerrain.some(t => same(t, cell))) return 'Path crosses blocked terrain.';
    return null;
  };
  let previous = vehicle.position;
  const traversedPath = [];
  for (const cell of preview.path) {
    const error = cellError(cell);
    if (error) return reject(error);
    if (cell.x !== previous.x && cell.y !== previous.y) {
      const sideError = cellError({ x: cell.x, y: previous.y }) || cellError({ x: previous.x, y: cell.y });
      if (sideError || same(opponent.position, { x: cell.x, y: previous.y }) || same(opponent.position, { x: previous.x, y: cell.y })) return reject(`Diagonal corner blocked. ${sideError ?? 'Occupied side cell.'}`);
    }
    if (same(opponent.position, cell)) {
      const contact = { targetPlayer: opponent.owner, cell: { ...cell } };
      return { ...preview, legal: true, reason: '', attemptedPath: preview.path, path: traversedPath,
        destination: { ...previous }, facing: vehicle.facing, contact,
        ramEligible: vehicle.speed >= 2 && vehicle.speed <= 3 && !opponent.disabled };
    }
    traversedPath.push(cell);
    previous = cell;
  }
  return { ...preview, attemptedPath: preview.path, contact: null, ramEligible: false, legal: true, reason: '' };
}
