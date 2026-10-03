import { movementOption } from './movement.js';

export const PHASE1_ACTIONS = Object.freeze({});
export function crewAvailable(state, player, role) {
  return Object.values(state.crew).some(c => c.owner === player && c.role === role && c.wounds > 0 && c.location === 'own_vehicle');
}
export function legalActions(state, player, content, registry = PHASE1_ACTIONS) {
  if (state.status !== 'playing' || state.activePlayer !== player || state.activation.phase !== 'action' || state.activation.actionConsumed) return [];
  return Object.keys(registry).filter(type => registry[type].legal(state, player, content));
}
export function contactRamEligible(state, player) {
  const vehicle = state.vehicles[player];
  const contact = state.activation.movement?.contact;
  return state.activePlayer === player && state.activation.phase === 'action'
    && !state.activation.actionConsumed && !!contact
    && vehicle.speed >= 2 && vehicle.speed <= 3 && !vehicle.disabled
    && !state.vehicles[contact.targetPlayer].disabled;
}
export function nextActivation(state) {
  state.activePlayer = state.activePlayer === 'A' ? 'B' : 'A';
  state.turn++;
  state.activation = { id: state.activation.id + 1, phase: 'movement', movement: null, actionConsumed: false, speedChanged: false, boarderStartedAboard: Object.values(state.crew).some(c => c.owner === state.activePlayer && c.role === 'boarder' && c.wounds > 0 && c.location === 'enemy_vehicle') };
}
export function settleActivation(input, content, registry = PHASE1_ACTIONS) {
  if (input.status !== 'playing' || input.winner !== null) return input;
  const state = structuredClone(input);
  const player = state.activePlayer;
  const transitions = [];
  if (state.activation.phase === 'movement') {
    const reason = !crewAvailable(state, player, 'driver') ? 'DRIVER_UNAVAILABLE'
      : !content.maneuvers.some(m => movementOption(state, player, m.id, content).legal) ? 'NO_LEGAL_MANEUVER' : null;
    if (reason) {
      const vehicle = state.vehicles[player];
      state.activation.movement = { reason, origin: { ...vehicle.position }, destination: { ...vehicle.position }, facing: vehicle.facing, attemptedPath: [], traversedPath: [], contact: null, ramEligible: false };
      state.activation.phase = 'action';
      transitions.push({ type: 'STATIONARY', player, reason, activationId: state.activation.id });
    }
  }
  if (state.activation.phase === 'action' && legalActions(state, player, content, registry).length === 0) {
    transitions.push({ type: 'AUTO_END_ACTIVATION', player, reason: 'NO_LEGAL_ACTION', activationId: state.activation.id });
    state.lastActivation = structuredClone({ ...state.activation, player });
    nextActivation(state);
  } else if (state.activation.phase === 'end') {
    transitions.push({ type: 'AUTO_END_ACTIVATION', player, reason: 'ACTION_CONSUMED', activationId: state.activation.id });
    state.lastActivation = structuredClone({ ...state.activation, player });
    nextActivation(state);
  }
  if (!transitions.length) return input;
  state.transitionEvents = [...(input.transitionEvents ?? []), ...transitions];
  return state;
}
