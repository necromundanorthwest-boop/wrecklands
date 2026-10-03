import { PHASE2_ACTIONS, speedReason } from './gameplay.js';
import { addRisk, evaluateVictory } from './effects.js';
import { appendEvent } from './history.js';
import { movementOption } from './movement.js';
import { PHASE1_ACTIONS, legalActions, settleActivation } from './activation.js';

export class RuleError extends Error {
  constructor(code, message, status = 409) { super(message); this.code = code; this.status = status; }
}
const fail = (code, message) => { throw new RuleError(code, message); };

export function applyIntent(state, player, intent, content, registry = PHASE1_ACTIONS, roll = () => { throw new Error("Authoritative die source required"); }) {
  if (state.status !== 'playing' || state.winner !== null) fail('NOT_PLAYING', 'This room is not accepting gameplay actions.');
  if (state.activePlayer !== player) fail('NOT_YOUR_TURN', `Waiting for Player ${state.activePlayer}.`);
  if (intent.expectedVersion !== state.version) fail('STALE_VERSION', 'The board changed. Review the current state and choose again.');
  if (intent.activationId !== state.activation.id) fail('STALE_ACTIVATION', 'This activation has already ended.');
  if (!intent.payload || typeof intent.payload !== 'object' || Array.isArray(intent.payload)) fail('BAD_PAYLOAD', 'Payload must be an object.');
  const phase2 = registry === PHASE2_ACTIONS;
  const fields = intent.type === 'MOVE' ? ['maneuverId'] : phase2 && intent.type === 'SET_SPEED' ? ['speed'] : Object.hasOwn(registry,intent.type) ? registry[intent.type].fields ?? [] : intent.type === 'END_ACTIVATION' ? [] : null;
  if (fields === null) fail('UNKNOWN_ACTION', 'Unknown action type.');
  if (Object.keys(intent.payload).length !== fields.length || fields.some(k => !Object.hasOwn(intent.payload,k) || (k === 'speed' ? !Number.isInteger(intent.payload[k]) : typeof intent.payload[k] !== 'string' || !intent.payload[k].length))) fail('BAD_PAYLOAD','Malformed or extraneous action payload fields.');
  const ctx = {roll,rolls:[],lossResolving:new Set(),actor:state.vehicles[player].id,target:intent.payload.targetId ?? intent.payload.targetCrewId ?? intent.payload.scrapId ?? null};
  let next = structuredClone(state);
  next.transitionEvents = [];
  if (phase2 && intent.type === 'SET_SPEED') {
    const reason = speedReason(state,player,intent.payload.speed);
    if(reason) fail('ILLEGAL_SPEED',reason);
    next.vehicles[player].speed=intent.payload.speed; next.activation.speedChanged=true;
    ctx.outcome=`Speed changed to ${intent.payload.speed}`;
  } else if (intent.type === 'MOVE') {
    if (Object.keys(intent.payload).length !== 1 || typeof intent.payload.maneuverId !== 'string') fail('BAD_PAYLOAD', 'Movement requires one maneuver ID.');
    const option = movementOption(state, player, intent.payload.maneuverId, content);
    if (!option.legal) fail('ILLEGAL_MOVE', option.reason);
    next.vehicles[player].position = option.destination;
    next.vehicles[player].facing = option.facing;
    next.activation.movement = { maneuverId: intent.payload.maneuverId, origin: { ...state.vehicles[player].position }, destination: option.destination, facing: option.facing, attemptedPath: option.attemptedPath, traversedPath: option.path, contact: option.contact, ramEligible: option.ramEligible };
    next.activation.phase = 'action';
    next.lastEvent = { type: 'MOVE', player, ...next.activation.movement };
    next.transitionEvents.push({ type: 'ENTER_ACTION', player, activationId: state.activation.id });
    if(phase2) addRisk(next,player,option.riskCost,content,ctx);
    ctx.outcome='Movement confirmed';
  } else if (intent.type === 'END_ACTIVATION') {
    fail('AUTOMATIC_ONLY', 'Activation ending is automatic; there is no selectable Pass or End action.');
  } else {
    if (!Object.hasOwn(registry, intent.type)) fail('UNKNOWN_ACTION', 'That action is unavailable in Phase 1.');
    if (!legalActions(state, player, content, registry).includes(intent.type)) fail('ILLEGAL_ACTION', 'This action is not legal in the current activation.');
    const handler=registry[intent.type];
    if (phase2 && !handler.options(state,player,content).some(p => fields.every(k=>p[k]===intent.payload[k]))) fail('ILLEGAL_TARGET','Target is not eligible for this action.');
    handler.apply(next, player, content, intent.payload, ctx);
    if(phase2) next.summary.players[player].actions++;
    next.activation.actionConsumed = true;
    next.activation.phase = 'end';
    next.lastEvent = { type: intent.type, player, activationId: state.activation.id };
  }
  if(phase2) evaluateVictory(next,content);
  next = settleActivation(next, content, registry);
  next.version = state.version + 1;
  appendEvent(next,state,{actionId:intent.id,type:intent.type,player,actor:ctx.actor,target:ctx.target,rolls:ctx.rolls,outcome:ctx.outcome ?? intent.type,payload:structuredClone(intent.payload)});
  return next;
}
