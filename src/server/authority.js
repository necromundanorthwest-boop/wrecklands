import { PHASE2_ACTIONS } from '../rules/gameplay.js';
import { appendEvent } from '../rules/history.js';
import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { initialState, startMatch, isCompatibleState } from '../state/gameState.js';
import { applyIntent, RuleError } from '../rules/actions.js';
import { PHASE1_ACTIONS, settleActivation } from '../rules/activation.js';

const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const hash = value => createHash('sha256').update(value).digest('hex');
export const checksum = state => hash(JSON.stringify(state));
export const ROOM_TTL = 24 * 60 * 60 * 1000;

export class Authority {
  constructor(databasePath, content, actionRegistry = PHASE2_ACTIONS, roll = () => randomInt(1,7)) {
    this.actionRegistry = actionRegistry;
    this.roll = roll;
    this.content = content;
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY, state TEXT NOT NULL, a_hash TEXT NOT NULL, b_hash TEXT, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (code TEXT NOT NULL, player TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, version INTEGER NOT NULL, event TEXT NOT NULL, PRIMARY KEY(code, player, id));`);
  }
  transaction(operation) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  room(code) {
    const row = this.db.prepare('SELECT * FROM rooms WHERE code = ?').get(code);
    if (!row || row.expires <= Date.now()) throw new RuleError('ROOM_NOT_FOUND', 'Room not found or expired. Check the code or create a new game.', 404);
    let state;
    try { state = JSON.parse(row.state); } catch {}
    if (!isCompatibleState(state)) throw new RuleError('ROOM_INCOMPATIBLE', 'This room uses an unsupported rules profile or state schema. Return to the lobby and create a new game.', 409);
    if (state.contentVersion !== this.content.version) throw new RuleError('CONTENT_CHANGED', 'This room uses an older content version. Return to the lobby and create a new game.', 409);
    return { ...row, state };
  }
  lobbyToken(value) {
    if (value === undefined) return randomBytes(32).toString('base64url');
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new RuleError('BAD_LOBBY_TOKEN', 'Invalid room request.', 400);
    return value;
  }
  create(requestToken) {
    const token = this.lobbyToken(requestToken);
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT code FROM rooms WHERE a_hash = ? AND expires > ?').get(hash(token), Date.now());
      if (existing) {
        const { state } = this.room(existing.code);
        return { roomId: existing.code, player: 'A', token, state, checksum: checksum(state) };
      }
      let code;
      do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); }
      while (this.db.prepare('SELECT code FROM rooms WHERE code = ?').get(code));
      const state = initialState(code, this.content);
      this.db.prepare('INSERT INTO rooms VALUES (?, ?, ?, NULL, ?)').run(code, JSON.stringify(state), hash(token), Date.now() + ROOM_TTL);
      return { roomId: code, player: 'A', token, state, checksum: checksum(state) };
    });
  }
  join(code, requestToken) {
    const token = this.lobbyToken(requestToken);
    return this.transaction(() => {
      const room = this.room(code);
      if (room.b_hash === hash(token)) return { roomId: code, player: 'B', token, state: room.state, checksum: checksum(room.state) };
      if (room.b_hash) throw new RuleError('ROOM_FULL', 'This room already has two players. Reconnect using the original tab.', 409);
      if (room.a_hash === hash(token)) throw new RuleError('INVALID_SEAT', 'Use a separate browser session for Player B.', 409);
      const state = settleActivation(startMatch(room.state, this.roll()), this.content, this.actionRegistry);
      this.db.prepare('UPDATE rooms SET state = ?, b_hash = ?, expires = ? WHERE code = ?').run(JSON.stringify(state), hash(token), Date.now() + ROOM_TTL, code);
      return { roomId: code, player: 'B', token, state, checksum: checksum(state) };
    });
  }
  identify(room, token) {
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) throw new RuleError('INVALID_SEAT', 'Player session could not be restored. Return to the lobby.', 401);
    const candidate = hash(token);
    const player = candidate === room.a_hash ? 'A' : candidate === room.b_hash ? 'B' : null;
    if (!player) throw new RuleError('INVALID_SEAT', 'Player session could not be restored. Return to the lobby.', 401);
    return player;
  }
  snapshot(code, token) {
    const room = this.room(code);
    const player = this.identify(room, token);
    return { state: room.state, player, checksum: checksum(room.state) };
  }
  command(code, token, intent) {
    if (!intent || typeof intent !== 'object' || Array.isArray(intent) || typeof intent.id !== 'string' || !/^[A-Za-z0-9_-]{16,100}$/.test(intent.id) || typeof intent.type !== 'string' || !Number.isSafeInteger(intent.expectedVersion) || !Number.isSafeInteger(intent.activationId) || !intent.payload || typeof intent.payload !== 'object' || Array.isArray(intent.payload)) {
      throw new RuleError('BAD_INTENT', 'Malformed action intent.', 400);
    }
    const keys = ['id', 'type', 'expectedVersion', 'activationId', 'payload'];
    if (Object.keys(intent).some(key => !keys.includes(key))) throw new RuleError('BAD_INTENT', 'Unexpected action fields.', 400);
    const fingerprint = hash(JSON.stringify({ type: intent.type, expectedVersion: intent.expectedVersion, activationId: intent.activationId, payload: Object.fromEntries(Object.entries(intent.payload).sort()) }));
    return this.transaction(() => {
      const room = this.room(code);
      const player = this.identify(room, token);
      const receipt = this.db.prepare('SELECT * FROM receipts WHERE code = ? AND player = ? AND id = ?').get(code, player, intent.id);
      if (receipt) {
        if (receipt.fingerprint !== fingerprint) throw new RuleError('ID_REUSED', 'This action ID was already used for a different command.', 409);
        return { state: room.state, checksum: checksum(room.state), duplicate: true, receipt: { id: intent.id, version: receipt.version, event: JSON.parse(receipt.event) } };
      }
      const state = applyIntent(room.state, player, intent, this.content, this.actionRegistry, this.roll);
      this.db.prepare('UPDATE rooms SET state = ?, expires = ? WHERE code = ?').run(JSON.stringify(state), Date.now() + ROOM_TTL, code);
      this.db.prepare('INSERT INTO receipts VALUES (?, ?, ?, ?, ?, ?)').run(code, player, intent.id, fingerprint, state.version, JSON.stringify(state.lastEvent));
      return { state, checksum: checksum(state), duplicate: false, receipt: { id: intent.id, version: state.version, event: state.lastEvent } };
    });
  }
  advanceAutomatic(code) {
    return this.transaction(() => {
      const room = this.room(code);
      const base = { ...room.state, transitionEvents: [] };
      const state = settleActivation(base, this.content, this.actionRegistry);
      if (state === base) return null;
      state.version = room.state.version + 1;
      appendEvent(state,room.state,{type:'AUTOMATIC',player:room.state.activePlayer,outcome:'Automatic activation transition'});
      this.db.prepare('UPDATE rooms SET state = ? WHERE code = ?').run(JSON.stringify(state), code);
      return { state, checksum: checksum(state) };
    });
  }
  close() { this.db.close(); }
}
