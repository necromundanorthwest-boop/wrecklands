import { actionLabel, renderConditions, eventText, actionHint, phaseText, presentEvent, targetPreview, renderSummary } from './ui/presentation.js';
import { actionOptions, speedReason } from './rules/gameplay.js';
import { pushCell, forwardArc } from './rules/geometry.js';
import { movementOption } from './rules/movement.js';
import { renderBoard } from './game/Renderer.js';
import { request, openStream, ApiError } from './multiplayer/sync.js';
import { PENDING_KEY, savedSession, saveSession, clearSession } from './multiplayer/room.js';

const $ = id => document.getElementById(id);
let content, state, stateChecksum = '', session = savedSession(), selected = null;
let connected = false, presence = { A: false, B: false }, stopStream, pending = null, sending = false, retryTimer;
const feedback = text => { $('feedback').textContent = text; };

function accept(data) {
  if (!data.state || data.state.roomId !== session?.roomId) return;
  if (data.state.contentVersion !== content.version) { connected = false; feedback('Content changed. Reload this page before continuing.'); render(); return; }
  if (!state || data.state.version >= state.version) {
    if (!state || data.state.version > state.version) selected = null;
    state = data.state;
    stateChecksum = data.checksum;
  }
  if (data.presence) presence = data.presence;
  render();
}
function render() {
  if (!state || !session || !content) return;
  $('lobby').hidden = true; $('game').hidden = false;
  $('room-code').textContent = session.roomId;
  $('identity').textContent = `You are Player ${session.player}`;
  $('connection').textContent = connected ? 'Connected to room' : 'Disconnected — controls paused; reconnecting…';
  $('connection').dataset.online = String(connected);
  $('presence').textContent = `Player A: ${presence.A ? 'connected' : 'offline'} · Player B: ${presence.B ? 'connected' : 'offline'}`;
  $('turn-label').textContent = `ACTIVATION ${state.activation.id} · TURN ${state.turn}`;
  const myTurn = state.status === 'playing' && state.activePlayer === session.player;
  const canMove = connected && !pending && myTurn && state.activation.phase === 'movement';
  const phase = phaseText(state, session.player, pending, selected);
  $('turn-status').textContent = phase.title;
  $('turn-status').dataset.active = String(myTurn);
  $('instruction').textContent = !connected ? 'Your seat is saved in this tab. Waiting for the latest room state.' : phase.instruction;
  const vehicle = state.vehicles[session.player];
  renderConditions($('vehicle-status'), $('crew-status'), state, content, session.player);
  const options = content.maneuvers.map(m => ({ maneuver: m, option: movementOption(state, session.player, m.id, content) }));
  $('maneuvers').replaceChildren();
  for (const { maneuver, option } of options) {
    const wrap = document.createElement('div'); wrap.className = 'maneuver';
    const button = document.createElement('button');
    button.textContent = maneuver.name;
    button.dataset.maneuver = maneuver.id;
    button.disabled = !canMove || !option.legal;
    button.setAttribute('aria-pressed', String(selected === maneuver.id));
    const reason = option.reason || (!connected ? 'Reconnect to move.' : pending ? 'Waiting for confirmation.' : `Speed ${maneuver.minSpeed}–${maneuver.maxSpeed} · Risk +${maneuver.risk}`);
    button.title = reason;
    const note = document.createElement('small'); note.id = `reason-${maneuver.id}`; note.textContent = reason;
    button.setAttribute('aria-describedby', note.id);
    button.addEventListener('click', () => { selected = maneuver.id; feedback(''); render(); });
    wrap.append(button, note); $('maneuvers').append(wrap);
  }
  const preview = selected && canMove ? options.find(o => o.maneuver.id === selected)?.option : null;
  $('preview').textContent = preview?.legal ? `Path: ${preview.path.map(p => `(${p.x}, ${p.y})`).join(' → ') || 'Stationary contact'}. Destination: (${preview.destination.x}, ${preview.destination.y}). Final facing: ${preview.facing}.${preview.contact ? ' Contact: stop before vehicle; no impact. Ram still requires Cruise or Full Throttle and explicit selection.' : ''} Speed: ${vehicle.speed}. Risk cost: +${preview.riskCost}.${vehicle.risk + preview.riskCost >= 6 ? ' Loss of Control will resolve at Risk 6+.' : ''}` : 'Select a legal maneuver to preview its path and final facing.';
  if (preview?.legal && vehicle.speed >= 2 && (preview.contact || forwardArc({...vehicle, position:preview.destination, facing:preview.facing}, state.vehicles[session.player==='A'?'B':'A'].position))) $('preview').textContent += ' Potential Ram after movement; any Loss of Control resolves first.';
  $('cancel-preview').hidden = !selected;
  $('confirm').disabled = !canMove || !preview?.legal;
  $('end').disabled = true;
  $('end').hidden = true;
  if (canMove && !options.some(o => o.option.legal)) $('instruction').textContent = 'No legal maneuver. Movement is skipped automatically; checking the action phase.';
  $('speed-controls').replaceChildren();
  for(const speed of [1,2,3]) {
    const button=document.createElement('button');button.textContent=['','Crawl','Cruise','Full Throttle'][speed];button.dataset.speed=String(speed);
    const reason=speedReason(state,session.player,speed);button.disabled=!connected||!!pending||!!selected||!!reason;button.title=reason||'Change Speed once, before movement';
    button.onclick=()=>submit('SET_SPEED',{speed});$('speed-controls').append(button);
  }
  $('actions').replaceChildren();
  $('actions').hidden = state.status !== 'playing' || state.activation.phase !== 'action';
  $('maneuvers').hidden = state.activation.phase !== 'movement';
  $('speed-controls').hidden = state.activation.phase !== 'movement';
  $('preview').hidden = state.activation.phase !== 'movement';
  $('confirm').hidden = state.activation.phase !== 'movement';
  for(const action of actionOptions(state,session.player,content)) {
    for(const payload of action.options.length?action.options:[null]) {
      const wrap=document.createElement('div'),button=document.createElement('button'),note=document.createElement('small');wrap.className='maneuver';
      button.textContent=actionLabel(action,state,session.player,content)+(payload?.scrapId?` at (${state.scrap[payload.scrapId].x}, ${state.scrap[payload.scrapId].y})`:'');button.dataset.action=action.type;if(payload?.scrapId)button.dataset.scrapTarget=payload.scrapId;
      button.disabled=!connected||!!pending||!myTurn||!payload;
      let hint=payload?'Consumes this activation’s action.':state.activation.phase!=='action'?'Available after movement.':action.reason;
      if(payload&&action.type==='RAM'){const cell=pushCell(vehicle,state.vehicles[session.player==='A'?'B':'A']);hint+=` Push result would try (${cell.x}, ${cell.y}); blocked push adds 1 Risk.`;}
      if(payload&&action.type==='BOARD')hint+=' Boarding target: fixed 4+.';
      hint=actionHint(action,payload,state,session.player,content,hint);note.textContent=hint;button.title=hint;button.onmouseenter=button.onfocus=()=>targetPreview($('board'),state,session.player,action.type,payload,content);button.onmouseleave=button.onblur=()=>targetPreview($('board'),state,session.player,'',null,content);button.onclick=()=>submit(action.type,payload);wrap.append(button,note);$('actions').append(wrap);
    }
  }
  const historyKey = `${state.roomId}:${state.version}`;
  if ($('action-log').dataset.version !== historyKey) {
    $('action-log').dataset.version = historyKey;
    $('action-log').replaceChildren(...[...state.events].reverse().map(event => {
      const li = document.createElement('li'); li.dataset.event = event.id; li.textContent = eventText(event); return li;
    }));
    const recent = [...state.events].reverse().find(e => !['AUTOMATIC','SET_SPEED'].includes(e.actionType)) ?? state.lastEvent;
    $('recent-text').textContent = recent ? eventText(recent) : 'Waiting for the match to start.';
    $('snapshot').textContent = JSON.stringify(state, null, 2);
  }
  $('match-summary').hidden=state.winner===null;
  if(state.winner!==null){$('instruction').textContent='Match finished. Return to lobby to create another game.';renderSummary($('match-summary'),state,()=>$('leave').click());}
  const start = state.startSelection;
  $('starting-roll').textContent = start ? `Starting player: D6 rolled ${start.roll}. ${start.rule}. Player ${start.player} started.` : '';
  $('revision').textContent = `State version ${state.version} · ${state.activation.phase} · ${state.contentVersion}`;
  $('checksum').textContent = `SHA-256: ${stateChecksum}`;
  renderBoard($('board'), state, content, preview?.legal ? preview : null);
  presentEvent($('board'), state, session.player, content);
}

async function flushPending() {
  if (!pending || sending || !session || !connected) return;
  sending = true;
  const currentSession = session;
  const intent = pending.intent;
  try {
    const data = await request(`/api/rooms/${session.roomId}/actions`, { method: 'POST', token: session.token, body: intent });
    if (session !== currentSession) return;
    pending = null; sessionStorage.removeItem(PENDING_KEY);
    accept(data);
    feedback(data.duplicate ? 'Previously confirmed action restored. No duplicate effect.' : 'Action confirmed. See Latest result.');
  } catch (error) {
    if (session !== currentSession) return;
    if (error instanceof ApiError && error.status < 500) {
      pending = null; sessionStorage.removeItem(PENDING_KEY);
      feedback(error.message);
      if (error.status === 401 || error.status === 404) { connected = false; stopStream?.(); }
      else { try { accept(await request(`/api/rooms/${session.roomId}/state`, { token: session.token })); } catch {} }
    } else {
      feedback('Confirmation interrupted. Retrying the same action safely…');
      clearTimeout(retryTimer); retryTimer = setTimeout(flushPending, 1200);
    }
  } finally { sending = false; render(); }
}
function submit(type, payload = {}) {
  if (!connected || pending) return;
  pending = { roomId: session.roomId, intent: { id: crypto.randomUUID(), expectedVersion: state.version, activationId: state.activation.id, type, payload } };
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  selected = null; render(); flushPending();
}
function attach() {
  stopStream?.();
  try { const stored = JSON.parse(sessionStorage.getItem(PENDING_KEY)); pending = stored?.roomId === session.roomId ? stored : null; } catch { pending = null; }
  $('lobby').hidden = true; $('game').hidden = false;
  $('room-code').textContent = session.roomId; $('identity').textContent = `You are Player ${session.player}`;
  stopStream = openStream(session, {
    onSnapshot: accept,
    onStatus: value => { connected = value && navigator.onLine; render(); if (connected) flushPending(); },
    onFatal: message => { connected = false; feedback(message); $('connection').textContent = 'Session unavailable — return to lobby.'; },
  });
}
async function enter(path) {
  $('create').disabled = $('join').disabled = true;
  $('lobby-message').textContent = 'Connecting…';
  try {
    let lobbyRequest;
    try { lobbyRequest = JSON.parse(sessionStorage.getItem('wrecklands.phase1.lobbyRequest')); } catch {}
    if (lobbyRequest?.path !== path) {
      const requestToken = Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
      lobbyRequest = { path, requestToken };
      sessionStorage.setItem('wrecklands.phase1.lobbyRequest', JSON.stringify(lobbyRequest));
    }
    const data = await request(path, { method: 'POST', body: { requestToken: lobbyRequest.requestToken } });
    saveSession(data); session = savedSession(); state = null; selected = null; feedback('');
    sessionStorage.removeItem('wrecklands.phase1.lobbyRequest');
    accept(data); attach();
  } catch (error) { $('lobby-message').textContent = `${error.message} Retry the same create/join request to recover safely.`; }
  finally { $('create').disabled = $('join').disabled = false; }
}
$('create').addEventListener('click', () => enter('/api/rooms'));
$('join-form').addEventListener('submit', event => {
  event.preventDefault();
  const code = $('room-input').value.trim().toUpperCase();
  if (!/^[A-Z2-9]{6}$/.test(code)) { $('lobby-message').textContent = 'Enter a valid six-character room code.'; return; }
  enter(`/api/rooms/${code}/join`);
});
$('cancel-preview').addEventListener('click', () => { selected = null; feedback('Preview cleared. You may reconsider Speed if it has not changed this activation.'); render(); });
$('confirm').addEventListener('click', () => { if (!$('confirm').disabled) submit('MOVE', { maneuverId: selected }); });
$('end').addEventListener('click', () => { if (!$('end').disabled) submit('END_ACTIVATION'); });
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(session.roomId); $('copy-status').textContent = 'Copied'; }
  catch { const range = document.createRange(); range.selectNodeContents($('room-code')); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); $('copy-status').textContent = 'Code selected — copy with Ctrl/Cmd+C.'; }
});
$('leave').addEventListener('click', () => {
  if (pending && !confirm('An action is awaiting confirmation. Leaving discards this tab’s recovery information. Return to lobby?')) return;
  stopStream?.(); clearTimeout(retryTimer); clearSession(); session = null; state = null; pending = null; connected = false; selected = null; presence = { A: false, B: false };
  $('game').hidden = true; $('lobby').hidden = false; $('lobby-message').textContent = '';
});
window.addEventListener('offline', () => { connected = false; render(); });
window.addEventListener('online', () => { if (session) attach(); });

try {
  content = await request('/api/content');
  $('create').disabled = $('join').disabled = false;
  $('lobby-message').textContent = '';
  if (session) attach();
} catch { $('lobby-message').textContent = 'Game data could not be loaded. Refresh to retry.'; }
