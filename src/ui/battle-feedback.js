const pause = duration => new Promise(resolve => window.setTimeout(resolve, duration));
const feedbackClasses = { damage: 'is-hit', heal: 'is-healed', shield: 'is-warded', mp_restore: 'is-energized' };

// Group AoE impacts together; repeated hits or a hit followed by healing stay ordered.
function feedbackBatches(events) {
  const batches = [];
  for (const event of events) {
    if (!feedbackClasses[event.type]) continue;
    if (event.type !== 'damage' && event.amount <= 0) continue;
    if (event.type === 'damage' && event.amount + event.absorbed <= 0) continue;
    const last = batches.at(-1);
    if (last && last[0].type === event.type && !last.some(item => item.targetId === event.targetId)) last.push(event);
    else batches.push([event]);
  }
  return batches;
}

export async function playBattleFeedback(events, root = document) {
  // Do not hold up turns on a background tab just to play invisible effects.
  if (document.hidden) return;
  const cards = new Map([...root.querySelectorAll('[data-actor-id]')].map(card => [card.dataset.actorId, card]));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  for (const batch of feedbackBatches(events)) {
    const className = feedbackClasses[batch[0].type];
    const targets = batch.map(event => cards.get(event.targetId)).filter(Boolean);
    if (!targets.length) continue;
    try {
      for (const card of targets) card.classList.add(className);
      await pause(reducedMotion ? 150 : className === 'is-healed' ? 540 : 400);
    } finally {
      for (const card of targets) card.classList.remove(className);
    }
  }
}
