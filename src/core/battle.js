import { resolveCharacter } from './progression.js';
import { seededRandom } from './random.js';
import { WEAKNESS_MULTIPLIER } from './content.js';
import { isValidParty } from './party.js';
import { damageMultiplier, supportAmount, EMERGENCY_HP_THRESHOLD, effectiveStat } from './combat-math.js';
import { canTriggerFollowUp } from './follow-up.js';
import { assertOwnedParty } from './ownership.js';
import { assertValidEquipment } from './equipment.js';

const living = actor => actor.hp > 0;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createBattle(content, campaign, encounterId, random = seededRandom(1)) {
  const encounter = content.encounters[encounterId];
  if (!encounter) throw new Error(`Unknown encounter ${encounterId}`);
  if (!isValidParty(campaign.party, content.characters)) throw new Error('Invalid party');
  assertOwnedParty(campaign);
  assertValidEquipment(campaign, content);
  const makeActor = (definition, team, id) => ({
    ...structuredClone(definition), definitionId: definition.id, id, team,
    hp: definition.stats.maxHp, mp: definition.stats.maxMp, shield: 0, shieldSourceId: null,
    statuses: [], cooldowns: {}, reactionRound: 0, followUpRound: 0,
    resourceValues: Object.fromEntries(Object.keys(definition.resources ?? {}).map(key => [key, 0]))
  });
  const actors = [
    ...campaign.party.filter(Boolean).map(id => makeActor(resolveCharacter(content, campaign, id), 'party', id)),
    ...encounter.enemies.map((id, index) => makeActor(content.enemies[id], 'enemy', `enemy_${index}`))
  ];
  const battle = { content, encounterId, actors, random, round: 0, queue: [], cursor: 0, outcome: null, log: [], events: [], actionCount: 0 };
  startRound(battle);
  return battle;
}

export function getActor(battle, id) { return battle.actors.find(actor => actor.id === id); }
export function activeActor(battle) { return battle.outcome ? null : getActor(battle, battle.queue[battle.cursor]); }

function write(battle, message) {
  battle.log.push(message);
  if (battle.log.length > 200) battle.log.shift();
}

// Presentation events describe actual outcomes, independently of translated log text.
// They contain only the most recent action, including reactions and next-turn regen.
function emitEvent(battle, event) { battle.events.push(event); }

function statusDefinitions(battle, actor) { return actor.statuses.map(status => battle.content.statuses[status.id]); }
function modifier(battle, actor, key) { return statusDefinitions(battle, actor).reduce((sum, status) => sum + (status.modifiers?.[key] ?? 0), 0); }
function flag(battle, actor, key) { return statusDefinitions(battle, actor).some(status => status[key]); }
function stat(battle, actor, key) { return effectiveStat(actor, key, modifier(battle, actor, key)); }

function startRound(battle) {
  battle.round += 1;
  if (battle.round > 60) { battle.outcome = 'draw'; write(battle, 'Trận đấu dừng sau 60 vòng.'); return; }
  battle.queue = battle.actors.filter(living).sort((a, b) => stat(battle, b, 'speed') - stat(battle, a, 'speed')).map(actor => actor.id);
  battle.cursor = 0;
  for (const actor of battle.actors) {
    for (const id of Object.keys(actor.cooldowns)) actor.cooldowns[id] = Math.max(0, actor.cooldowns[id] - 1);
  }
  write(battle, `— Vòng ${battle.round} —`);
  beginTurn(battle);
}

function beginTurn(battle) {
  const actor = activeActor(battle);
  if (!actor) return;
  const passive = actor.passive;
  if (passive?.type === 'magic_followup_mp' && actor.resourceValues[passive.resource] >= passive.threshold) {
    const consumed = actor.resourceValues[passive.resource];
    actor.resourceValues[passive.resource] = 0;
    write(battle, `${actor.name} kích hoạt ${passive.name}, tiêu ${consumed} ${actor.resources[passive.resource].name}: hồi ${Math.round(passive.mpRestoreRatio * 100)}% MP tối đa toàn đội.`);
    for (const ally of battle.actors.filter(ally => ally.team === actor.team && living(ally))) {
      gainResource(battle, ally, 'mp', Math.round(ally.stats.maxMp * passive.mpRestoreRatio), actor.id);
    }
  }
  for (const status of [...actor.statuses]) {
    const definition = battle.content.statuses[status.id];
    if (definition.regen) {
      const recovered = Math.min(actor.stats.maxHp - actor.hp, Math.round(actor.stats.maxHp * definition.regen));
      actor.hp += recovered;
      if (recovered) {
        emitEvent(battle, { type: 'heal', targetId: actor.id, sourceId: status.sourceId, amount: recovered });
        write(battle, `${actor.name} hồi ${recovered} HP từ ${definition.name}.`);
      }
    }
  }
}

function checkOutcome(battle) {
  if (!battle.actors.some(actor => actor.team === 'enemy' && living(actor))) battle.outcome = 'victory';
  else if (!battle.actors.some(actor => actor.team === 'party' && living(actor))) battle.outcome = 'defeat';
  return battle.outcome;
}

function advance(battle) {
  if (checkOutcome(battle)) return;
  battle.cursor += 1;
  while (battle.cursor < battle.queue.length && !living(getActor(battle, battle.queue[battle.cursor]))) battle.cursor += 1;
  if (battle.cursor >= battle.queue.length) startRound(battle);
  else beginTurn(battle);
}

export function targetsFor(battle, actor, skill) {
  if (skill.target === 'self') return living(actor) ? [actor] : [];
  const allies = skill.target === 'ally' || skill.target === 'all_allies';
  let targets = battle.actors.filter(target => living(target) && (allies ? target.team === actor.team : target.team !== actor.team));
  if (skill.target === 'enemy') {
    const taunting = targets.filter(target => flag(battle, target, 'taunt'));
    if (taunting.length) targets = taunting;
  }
  return targets;
}

export function abilityAvailability(battle, actor, skill) {
  if (!actor || !living(actor)) return { ok: false, reason: 'Không thể hành động.' };
  if ((actor.cooldowns[skill.id] ?? 0) > 0) return { ok: false, reason: `Hồi chiêu: ${actor.cooldowns[skill.id]} vòng.` };
  if (actor.mp < (skill.cost?.mp ?? 0)) return { ok: false, reason: 'Không đủ MP.' };
  const resource = skill.cost?.resource;
  if (resource && (actor.resourceValues[resource.id] ?? 0) < (resource.min ?? resource.amount ?? 1)) return { ok: false, reason: `Chưa đủ ${actor.resources?.[resource.id]?.name ?? resource.id}.` };
  return { ok: true, reason: '' };
}

function gainResource(battle, actor, id, amount, sourceId = actor.id) {
  if (id === 'mp') {
    const recovered = Math.min(amount, actor.stats.maxMp - actor.mp);
    actor.mp = clamp(actor.mp + amount, 0, actor.stats.maxMp);
    if (recovered > 0) {
      emitEvent(battle, { type: 'mp_restore', targetId: actor.id, sourceId, amount: recovered });
      write(battle, `${actor.name} hồi ${recovered} MP.`);
    }
    return;
  }
  if (!actor.resources?.[id]) return;
  // Exhaustion prevents resource generation, but does not remove stored resources.
  if (amount > 0 && flag(battle, actor, 'blockResourceGain')) return;
  actor.resourceValues[id] = clamp((actor.resourceValues[id] ?? 0) + amount, 0, actor.resources[id].max);
}

function coverTarget(battle, target) {
  for (const status of target.statuses) {
    if (battle.content.statuses[status.id].cover) {
      const source = getActor(battle, status.sourceId);
      if (source && living(source) && source.id !== target.id) return source;
    }
  }
  return target;
}

function triggerMagicFollowups(battle, attacker, target) {
  for (const ally of battle.actors) {
    const passive = ally.passive;
    if (!living(target)) break;
    if (!canTriggerFollowUp(ally, attacker, target)
      || passive?.type !== 'magic_followup_mp' || ally.followUpRound === battle.round) continue;
    // Reserve the once-per-round activation before damage to prevent reaction chains.
    ally.followUpRound = battle.round;
    const ability = battle.content.abilities[passive.followUpAbility];
    write(battle, `${ally.name} đánh bồi bằng ${ability.name}.`);
    for (const effect of ability.effects) {
      for (let i = 0; i < (effect.hits ?? 1) && living(target); i += 1) hit(battle, ally, target, effect, 0, { reaction: true });
    }
    gainResource(battle, ally, passive.resource, 1);
    write(battle, `${ally.name}: ${ally.resources[passive.resource].name} ${ally.resourceValues[passive.resource]} / ${ally.resources[passive.resource].max}.`);
  }
}

function hit(battle, attacker, originalTarget, effect, spent = 0, { reaction = false, area = false } = {}) {
  const target = !area && !reaction ? coverTarget(battle, originalTarget) : originalTarget;
  if (!living(attacker) || !living(target)) return;
  if (target.id !== originalTarget.id) write(battle, `${target.name} chắn đòn cho ${originalTarget.name}.`);
  const evasion = effect.damageType === 'physical' && !effect.unavoidable ? clamp(modifier(battle, target, 'evasion'), 0, 0.85) : 0;
  if (evasion > 0 && battle.random() < evasion) {
    emitEvent(battle, { type: 'dodge', targetId: target.id, sourceId: attacker.id });
    write(battle, `${target.name} né đòn của ${attacker.name}.`);
    if (!reaction && target.passive?.type === 'dodge_counter' && target.reactionRound !== battle.round) {
      target.reactionRound = battle.round;
      gainResource(battle, target, target.passive.resource, 1);
      write(battle, `${target.name} phản kiếm!`);
      hit(battle, target, attacker, { type: 'damage', damageType: 'physical', element: target.element, multiplier: 0.85, unavoidable: true }, 0, { reaction: true });
    }
    return;
  }
  const power = stat(battle, attacker, effect.damageType === 'physical' ? 'attack' : 'magic');
  const defense = stat(battle, target, effect.damageType === 'physical' ? 'defense' : 'resistance') * (1 - (effect.penetration ?? 0));
  let stacks = 0;
  if (effect.consumeStatus) {
    const mark = target.statuses.find(status => status.id === effect.consumeStatus);
    stacks = mark?.stacks ?? 0;
    target.statuses = target.statuses.filter(status => status.id !== effect.consumeStatus);
  }
  const multiplier = damageMultiplier(effect, { spent, stacks, hpRatio: attacker.hp / attacker.stats.maxHp });
  let reduction = modifier(battle, target, 'damageReduction');
  if (target.passive?.type === 'damage_reduction') reduction += target.passive.amount;
  const weakness = target.weaknesses?.includes(effect.element) ?? false;
  let amount = Math.max(1, Math.floor(Math.max(1, power * multiplier - defense * 0.55)
    * (target.resistances?.[effect.element] ?? 1)
    * (weakness ? WEAKNESS_MULTIPLIER : 1)
    * Math.max(0.1, 1 + modifier(battle, attacker, 'damageBonus'))
    * (1 - clamp(reduction, 0, 0.75))));
  const absorbed = Math.min(target.shield, amount);
  target.shield -= absorbed;
  amount -= absorbed;
  const lostHp = Math.min(target.hp, amount);
  target.hp -= lostHp;
  emitEvent(battle, { type: 'damage', targetId: target.id, sourceId: attacker.id, amount: lostHp, absorbed, element: effect.element, weakness });
  write(battle, `${attacker.name} → ${target.name}: ${lostHp} sát thương${absorbed ? `, khiên chặn ${absorbed}` : ''}${weakness ? `, yếu ${effect.element.toUpperCase()} (+50%)` : ''}.`);
  if (absorbed && target.shield === 0 && living(target)) {
    const healer = getActor(battle, target.shieldSourceId);
    if (healer?.passive?.type === 'shield_break_heal' && living(healer)) {
      const heal = Math.min(target.stats.maxHp - target.hp, Math.round(healer.stats.magic * healer.passive.multiplier));
      target.hp += heal;
      if (heal) emitEvent(battle, { type: 'heal', targetId: target.id, sourceId: healer.id, amount: heal });
      write(battle, `${target.name} hồi ${heal} HP từ Dư âm thủy hộ.`);
    }
  }
  if (living(target) && (lostHp || absorbed)) {
    for (const status of statusDefinitions(battle, target)) {
      if (status.onDamagedResource) gainResource(battle, target, status.onDamagedResource, 1);
    }
  }
  if (!living(target)) write(battle, `${target.name} gục xuống.`);
  else if (!reaction && !area && effect.damageType === 'magical' && lostHp + absorbed > 0) triggerMagicFollowups(battle, attacker, target);
}

function applyEffect(battle, actor, targets, effect, spent, area) {
  const recipients = effect.to === 'self' ? [actor] : targets;
  for (const target of recipients) {
    if (!living(target)) continue;
    if (effect.type === 'damage') {
      for (let i = 0; i < (effect.hits ?? 1) && living(target) && living(actor); i += 1) hit(battle, actor, target, effect, spent, { area });
    }
    if (effect.type === 'heal') {
      const amount = Math.min(target.stats.maxHp - target.hp, supportAmount(effect, actor.stats.magic, target.hp / target.stats.maxHp <= EMERGENCY_HP_THRESHOLD));
      target.hp += amount;
      if (amount) emitEvent(battle, { type: 'heal', targetId: target.id, sourceId: actor.id, amount });
      write(battle, `${target.name} hồi ${amount} HP.`);
    }
    if (effect.type === 'shield') {
      const amount = supportAmount(effect, actor.stats.magic);
      // Shields do not stack; a weaker shield cannot overwrite a stronger one.
      if (amount > target.shield) {
        target.shield = amount;
        target.shieldSourceId = actor.id;
        emitEvent(battle, { type: 'shield', targetId: target.id, sourceId: actor.id, amount });
      }
      write(battle, `${target.name} có ${target.shield} khiên.`);
    }
    if (effect.type === 'resource') gainResource(battle, target, effect.resource, effect.amount, actor.id);
    if (effect.type === 'status') {
      const previous = target.statuses.find(status => status.id === effect.status);
      const maxStacks = battle.content.statuses[effect.status].maxStacks ?? 1;
      target.statuses = target.statuses.filter(status => status.id !== effect.status);
      target.statuses.push({ id: effect.status, remaining: effect.duration, sourceId: actor.id, stacks: Math.min(maxStacks, (previous?.stacks ?? 0) + 1) });
      write(battle, `${target.name}: ${battle.content.statuses[effect.status].name}.`);
    }
    if (effect.type === 'cleanse') {
      target.statuses = target.statuses.filter(status => battle.content.statuses[status.id].kind !== 'debuff');
      write(battle, `${target.name} được giải hiệu ứng bất lợi.`);
    }
  }
}

export function basicAbility(actor) {
  const magical = actor.basicDamageType === 'magical';
  return {
    id: '$attack', name: magical ? 'Phép cơ bản' : 'Đánh thường', target: 'enemy',
    effects: [{ type: 'damage', damageType: magical ? 'magical' : 'physical', element: actor.element, multiplier: 1 }]
  };
}

export const DEFEND = { id: '$defend', name: 'Phòng thủ', target: 'self', effects: [{ type: 'status', status: 'guard', duration: 1 }] };

export function executeAction(battle, { actorId, abilityId, targetId }) {
  if (battle.outcome) throw new Error('Trận đấu đã kết thúc.');
  const actor = activeActor(battle);
  if (!actor || actor.id !== actorId) throw new Error('Chưa đến lượt nhân vật này.');
  const skill = abilityId === '$attack' ? basicAbility(actor) : abilityId === '$defend' ? DEFEND : battle.content.abilities[abilityId];
  if (!skill || (!abilityId.startsWith('$') && !actor.abilities.includes(abilityId))) throw new Error('Nhân vật chưa có kỹ năng này.');
  const availability = abilityAvailability(battle, actor, skill);
  if (!availability.ok) throw new Error(availability.reason);
  const legal = targetsFor(battle, actor, skill);
  const area = skill.target.startsWith('all_');
  const targets = area || skill.target === 'self' ? legal : legal.filter(target => target.id === targetId);
  if (!targets.length) throw new Error('Mục tiêu không hợp lệ.');
  // Validate everything before mutating MP, resources or turn order.
  battle.events = [];
  const oldStatuses = [...actor.statuses];
  actor.mp -= skill.cost?.mp ?? 0;
  let spent = 0;
  if (skill.cost?.resource) {
    const cost = skill.cost.resource;
    spent = cost.all ? actor.resourceValues[cost.id] : cost.amount;
    actor.resourceValues[cost.id] -= spent;
  }
  if (skill.cooldown) actor.cooldowns[skill.id] = skill.cooldown + 1;
  write(battle, `${actor.name} dùng ${skill.name}.`);
  for (const effect of skill.effects) applyEffect(battle, actor, targets, effect, spent, area);
  const offensive = skill.effects.some(effect => effect.type === 'damage');
  // Newly applied statuses last through the next turn; old ones tick on their owner's action.
  actor.statuses = actor.statuses.filter(status => {
    if (!oldStatuses.includes(status)) return true;
    if (offensive && battle.content.statuses[status.id].consumeOnAttack) return false;
    status.remaining -= 1;
    return status.remaining > 0;
  });
  battle.actionCount += 1;
  advance(battle);
  return battle;
}

export function executeEnemyTurn(battle) {
  const actor = activeActor(battle);
  if (!actor || actor.team !== 'enemy') return;
  const skills = actor.abilities.map(id => battle.content.abilities[id]).filter(skill => abilityAvailability(battle, actor, skill).ok && skill.effects.some(effect => effect.type === 'damage'));
  const skill = skills.length && battle.random() < 0.7 ? skills[Math.floor(battle.random() * skills.length)] : basicAbility(actor);
  const targets = targetsFor(battle, actor, skill);
  const target = targets[Math.floor(battle.random() * targets.length)];
  executeAction(battle, { actorId: actor.id, abilityId: skill.id, targetId: target?.id });
}
