export const blankCounters = () => ({scrapCollected:0,damageDealt:0,crewWoundsDealt:0,boardingAttempts:0,successfulBoardingAttempts:0,actions:0});
export function appendEvent(next,before,details) {
  const effects={};
  for(const key of ['vehicles','crew','scrap','winner','victoryReason','activation','activePlayer','turn']) if(JSON.stringify(before?.[key])!==JSON.stringify(next[key])) effects[key]={before:before?.[key]??null,after:structuredClone(next[key])};
  const sequence=next.events.length+1;
  const event={id:`${next.roomId}:${sequence}`,sequence,actionId:details.actionId??null,stateVersion:next.version,turn:before?.turn??next.turn,activationId:before?.activation.id??next.activation.id,actingPlayer:details.player??null,actionType:details.type,actor:details.actor??null,target:details.target??null,rolls:details.rolls??[],outcome:details.outcome??details.type,effects,transitions:structuredClone(next.transitionEvents),...details};
  next.events.push(event);next.lastEvent=event;
  next.summary.turns=next.turn;next.summary.activations=next.activation.id;
  return event;
}
