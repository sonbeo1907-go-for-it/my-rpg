import { validateEconomyContent } from './economy.js';

export const ELEMENTS = ['plain', 'fire', 'water', 'earth', 'wind', 'thunder', 'light', 'dark'];
export const WEAKNESS_MULTIPLIER = 1.5;
export const ROLE_GROUPS = {
  physical_dps: 'DPS vật lí', magical_dps: 'DPS ma pháp',
  offensive_support: 'Hỗ trợ tấn công', defensive_support: 'Hỗ trợ phòng thủ',
  tank: 'Tank', fighter: 'Đấu sĩ'
};
export const EFFECT_TYPES = ['damage', 'heal', 'shield', 'status', 'resource', 'cleanse'];

export function indexById(items) {
  return Object.fromEntries(items.map(item => [item.id, item]));
}

// Validate references before running a game, rather than failing midway through a battle.
export function validateContent(content) {
  const errors = [];
  const fail = message => errors.push(message);
  const exists = (collection, id, where) => {
    if (!content[collection]?.[id]) fail(`${where}: unknown ${collection} id "${id}"`);
  };
  for (const key of ['characters', 'abilities', 'statuses', 'upgrades', 'enemies', 'encounters']) {
    if (!content[key] || typeof content[key] !== 'object') fail(`Missing collection: ${key}`);
  }
  if (errors.length) return errors;
  for (const [id, actor] of Object.entries({ ...content.characters, ...content.enemies })) {
    if (!ELEMENTS.includes(actor.element)) fail(`${id}: invalid element`);
    if (actor.roleGroup !== undefined && !Object.hasOwn(ROLE_GROUPS, actor.roleGroup)) fail(`${id}: invalid role group`);
    if (actor.secondaryRoleGroups !== undefined && (!Array.isArray(actor.secondaryRoleGroups) || actor.secondaryRoleGroups.some(group => !Object.hasOwn(ROLE_GROUPS, group)))) fail(`${id}: invalid secondary role groups`);
    for (const stat of ['maxHp', 'maxMp', 'attack', 'magic', 'defense', 'resistance', 'speed']) {
      if (!Number.isFinite(actor.stats?.[stat]) || actor.stats[stat] < (stat === 'maxHp' ? 1 : 0)) fail(`${id}: invalid ${stat}`);
    }
    for (const skill of actor.abilities ?? []) {
      exists('abilities', skill, id);
      if (content.abilities[skill]?.activation === 'passive') fail(`${id}: passive ability ${skill} cannot be an active command`);
    }
    if (!actor.abilities?.length) fail(`${id}: requires abilities`);
    for (const [resource, definition] of Object.entries(actor.resources ?? {})) {
      if (!Number.isInteger(definition.max) || definition.max < 1) fail(`${id}: invalid resource ${resource}`);
    }
    for (const [element, multiplier] of Object.entries(actor.resistances ?? {})) {
      if (!ELEMENTS.includes(element) || !Number.isFinite(multiplier) || multiplier < 0) fail(`${id}: invalid resistance ${element}`);
    }
    if (actor.weaknesses !== undefined) {
      if (!Array.isArray(actor.weaknesses)) fail(`${id}: weaknesses must be an array`);
      else {
        for (const element of actor.weaknesses) if (!ELEMENTS.includes(element)) fail(`${id}: invalid weakness ${element}`);
        if (new Set(actor.weaknesses).size !== actor.weaknesses.length) fail(`${id}: duplicate weakness`);
      }
    }
    if (actor.passive?.type && !['damage_reduction', 'shield_break_heal', 'dodge_counter', 'magic_followup_mp', 'stat_boost'].includes(actor.passive.type)) fail(`${id}: invalid passive`);
    if (actor.passive?.type === 'stat_boost') {
      const modifiers = actor.passive.modifiers;
      if (!modifiers || typeof modifiers !== 'object' || Array.isArray(modifiers) || !Object.keys(modifiers).length) fail(`${id}: stat boost requires modifiers`);
      else for (const [key, amount] of Object.entries(modifiers)) {
        if (!['attack', 'magic', 'defense', 'resistance', 'speed'].includes(key) || !Number.isFinite(amount)) fail(`${id}: invalid permanent stat modifier ${key}`);
      }
    }
    if (actor.passive?.type === 'magic_followup_mp') {
      const passive = actor.passive;
      exists('abilities', passive.followUpAbility, id);
      const ability = content.abilities[passive.followUpAbility];
      if (ability && (ability.activation !== 'passive' || ability.target !== 'enemy' || ability.effects?.some(effect => effect.type !== 'damage' || effect.damageType !== 'magical'))) fail(`${id}: follow-up must be a passive single-target magical damage ability`);
      if (!actor.resources?.[passive.resource] || !Number.isInteger(passive.threshold) || passive.threshold < 1 || passive.threshold > actor.resources[passive.resource].max) fail(`${id}: invalid passive resource threshold`);
      if (!Number.isFinite(passive.mpRestoreRatio) || passive.mpRestoreRatio <= 0 || passive.mpRestoreRatio > 1) fail(`${id}: invalid passive MP restore ratio`);
    }
    const possibleSkills = [...(actor.abilities ?? []), ...Object.values(content.upgrades).filter(upgrade => upgrade.characterId === id).flatMap(upgrade => upgrade.changes.flatMap(change => change.ability ? [change.ability] : change.to ? [change.to] : []))];
    for (const skillId of possibleSkills) {
      const skill = content.abilities[skillId];
      if (!skill) continue;
      const resourceId = skill.cost?.resource?.id;
      if (resourceId && !actor.resources?.[resourceId]) fail(`${id}/${skillId}: unknown resource ${resourceId}`);
      for (const effect of skill.effects ?? []) {
        if (effect.type === 'resource' && effect.resource !== 'mp' && (effect.to === 'self' || skill.target === 'self') && !actor.resources?.[effect.resource]) fail(`${id}/${skillId}: unknown resource ${effect.resource}`);
      }
    }
  }
  for (const [id, skill] of Object.entries(content.abilities)) {
    if (skill.activation !== undefined && !['active', 'passive'].includes(skill.activation)) fail(`${id}: invalid activation`);
    if (!['enemy', 'all_enemies', 'ally', 'all_allies', 'self'].includes(skill.target)) fail(`${id}: invalid target`);
    if (!Number.isInteger(skill.cooldown ?? 0) || (skill.cooldown ?? 0) < 0) fail(`${id}: invalid cooldown`);
    if (!Number.isFinite(skill.cost?.mp ?? 0) || (skill.cost?.mp ?? 0) < 0) fail(`${id}: invalid MP cost`);
    if (skill.cost?.resource) {
      const cost = skill.cost.resource;
      if (cost.all ? !Number.isInteger(cost.min) || cost.min < 1 : !Number.isInteger(cost.amount) || cost.amount < 1) fail(`${id}: invalid resource cost`);
    }
    if (!skill.effects?.length) fail(`${id}: requires effects`);
    for (const effect of skill.effects ?? []) {
      if (!EFFECT_TYPES.includes(effect.type)) fail(`${id}: invalid effect ${effect.type}`);
      if (effect.type === 'status') {
        exists('statuses', effect.status, id);
        if (!Number.isInteger(effect.duration) || effect.duration < 1) fail(`${id}: invalid status duration`);
      }
      if (effect.type === 'damage') {
        if (!ELEMENTS.includes(effect.element)) fail(`${id}: invalid damage element`);
        if (!['physical', 'magical'].includes(effect.damageType)) fail(`${id}: invalid damage type`);
        if (effect.consumeStatus) exists('statuses', effect.consumeStatus, id);
      }
      for (const key of ['multiplier', 'perResource', 'perStack', 'flat', 'lowHpBonus']) {
        if (effect[key] !== undefined && (!Number.isFinite(effect[key]) || effect[key] < 0)) fail(`${id}: invalid effect ${key}`);
      }
      if (effect.type === 'resource' && (!effect.resource || !Number.isInteger(effect.amount) || effect.amount < 1)) fail(`${id}: invalid resource effect`);
      if (effect.penetration !== undefined && (!Number.isFinite(effect.penetration) || effect.penetration < 0 || effect.penetration > 1)) fail(`${id}: invalid penetration`);
      if (effect.hits !== undefined && (!Number.isInteger(effect.hits) || effect.hits < 1 || effect.hits > 20)) fail(`${id}: invalid hits`);
      if (effect.to && !['self', 'targets'].includes(effect.to)) fail(`${id}: invalid effect recipient`);
    }
  }
  for (const [id, status] of Object.entries(content.statuses)) {
    if (!['buff', 'debuff'].includes(status.kind)) fail(`${id}: invalid status kind`);
  }
  for (const [id, upgrade] of Object.entries(content.upgrades)) {
    exists('characters', upgrade.characterId, id);
    if (!upgrade.requires?.storyFlag) fail(`${id}: requires story flag`);
    for (const change of upgrade.changes ?? []) {
      if (change.type === 'unlock_ability') exists('abilities', change.ability, id);
      else if (change.type === 'replace_ability') {
        exists('abilities', change.from, id);
        exists('abilities', change.to, id);
      } else if (change.type === 'resource_max') {
        if (!content.characters[upgrade.characterId]?.resources?.[change.resource] || !Number.isInteger(change.max) || change.max < 1) fail(`${id}: invalid resource upgrade`);
      } else fail(`${id}: unknown upgrade operation`);
    }
  }
  for (const [id, encounter] of Object.entries(content.encounters)) {
    if (!encounter.enemies?.length) fail(`${id}: requires enemies`);
    for (const enemy of encounter.enemies ?? []) exists('enemies', enemy, id);
  }
  errors.push(...validateEconomyContent(content));
  return errors;
}

export function assembleContent(collections) {
  const content = {};
  for (const [name, items] of Object.entries(collections)) {
    const ids = new Set();
    for (const item of items) {
      if (!item.id || ids.has(item.id)) throw new Error(`${name}: duplicate or missing id ${item.id}`);
      ids.add(item.id);
    }
    content[name] = indexById(items);
  }
  const errors = validateContent(content);
  if (errors.length) throw new Error(`Invalid content:\n${errors.join('\n')}`);
  return content;
}

export const COLLECTIONS = ['characters', 'abilities', 'statuses', 'upgrades', 'enemies', 'encounters', 'economy', 'gearTypes', 'banners'];
