import { blankCounters, appendEvent } from '../rules/history.js';
export const SUPPORTED_SCHEMA_VERSION = 3;
export const SUPPORTED_RULES_PROFILE = 'phase2-canonical-34';

export function isCompatibleState(state) {
  return state !== null && typeof state === 'object' && !Array.isArray(state)
    && state.schemaVersion === SUPPORTED_SCHEMA_VERSION
    && state.rulesProfile === SUPPORTED_RULES_PROFILE;
}

export function initialState(roomId, content) {
  const definition = content.vehicles[0];
  const vehicles = {};
  const crew = {};
  for (const player of ['A', 'B']) {
    const start = content.map[`player${player}Start`];
    vehicles[player] = {
      id: `${player}_vehicle`, owner: player, definitionId: definition.id,
      position: { x: start.x, y: start.y }, facing: start.facing,
      speed: definition.startingSpeed, integrity: definition.maxIntegrity,
      armor: definition.armor, risk: definition.startingRisk,
      scrapCarried: 0, disabled: false,
    };
    for (const role of content.crew) {
      const id = `${player}_${role.id}`;
      crew[id] = { id, owner: player, definitionId: role.id, role: role.role, wounds: role.maxWounds, location: 'own_vehicle' };
    }
  }
  return {
    schemaVersion: SUPPORTED_SCHEMA_VERSION, rulesProfile: SUPPORTED_RULES_PROFILE, contentVersion: content.version,
    roomId, status: 'waiting', version: 0, turn: 1, activePlayer: null,
    activation: { id: 1, phase: 'waiting', movement: null, actionConsumed: false },
    lastActivation: null, transitionEvents: [], events: [], summary: { turns: 1, activations: 1, players: { A: blankCounters(), B: blankCounters() } },
    players: { A: { joined: true }, B: { joined: false } },
    mapId: content.map.id, vehicles, crew,
    scrap: Object.fromEntries(content.map.scrap.map(s => [s.id, { ...s }])),
    winner: null, victoryReason: null, startSelection: null, lastEvent: null,
  };
}

export function startMatch(state, roll) {
  const next = structuredClone(state);
  next.players.B.joined = true;
  next.status = 'playing';
  next.version++;
  next.activePlayer = roll <= 3 ? 'A' : 'B';
  next.activation.phase = 'movement';
  next.activation.speedChanged = false;
  next.activation.boarderStartedAboard = false;
  next.startSelection = { roll, rule: 'D6: 1–3 = A; 4–6 = B', player: next.activePlayer };
  next.lastEvent = { type: 'START', player: next.activePlayer, roll };
  appendEvent(next, state, { type: 'START', player: next.activePlayer, rolls: [{kind:'START',roll,targetNumber:null,success:null}], outcome: `Player ${next.activePlayer} starts` });
  return next;
}
