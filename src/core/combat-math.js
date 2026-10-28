export const EMERGENCY_HP_THRESHOLD = 0.35;
export const EMERGENCY_HEAL_MULTIPLIER = 1.6;

export function effectiveStat(actor, key, temporaryModifier = 0) {
  const base = actor.baseStats?.[key] ?? actor.stats[key];
  const permanent = actor.passive?.type === 'stat_boost' ? actor.passive.modifiers[key] ?? 0 : 0;
  return base * Math.max(0.1, 1 + permanent + temporaryModifier);
}

export function damageMultiplier(effect, { spent = 0, stacks = 0, hpRatio = 1 } = {}) {
  return (effect.multiplier ?? 1)
    + spent * (effect.perResource ?? 0)
    + stacks * (effect.perStack ?? 0)
    + (effect.lowHpBonus ?? 0) * (1 - hpRatio);
}

// Keep rounding identical in combat and the preparation preview.
export function supportAmount(effect, magic, emergency = false) {
  const base = Math.round((effect.flat ?? 0) + magic * (effect.multiplier ?? 0));
  return Math.round(base * (effect.emergency && emergency ? EMERGENCY_HEAL_MULTIPLIER : 1));
}
