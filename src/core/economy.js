import { ownsCharacter, unlockCharacter } from './ownership.js';
import { gearSlotCapacity, unlockDuplicateSlot } from './gear-slots.js';

const STAT_KEYS = ['maxHp', 'maxMp', 'attack', 'magic', 'defense', 'resistance', 'speed'];
const positiveInt = value => Number.isSafeInteger(value) && value > 0;
export const economyRules = content => content.economy.default;

export function validateEconomyContent(content) {
  const errors = [];
  const rules = content.economy?.default;
  if (!rules || !content.banners || !content.gearTypes) return ['Missing economy, banners or gearTypes'];
  for (const key of ['victoryCoins', 'singlePullCost', 'tenPullCost', 'duplicateShards', 'recruitCost']) {
    if (!positiveInt(rules[key])) errors.push(`economy: invalid ${key}`);
  }
  if (!positiveInt(rules.baseGearSlots) || !positiveInt(rules.maxGearSlots) || rules.maxGearSlots < rules.baseGearSlots) errors.push('economy: invalid gear slot limits');
  if (!Array.isArray(rules.starterCharacters) || !rules.starterCharacters.length
    || new Set(rules.starterCharacters).size !== rules.starterCharacters.length
    || rules.starterCharacters.some(id => !Object.hasOwn(content.characters, id))) errors.push('economy: invalid starterCharacters');
  if (!Array.isArray(rules.gearStats) || !rules.gearStats.length
    || new Set(rules.gearStats.map(item => item.stat)).size !== rules.gearStats.length
    || rules.gearStats.some(item => !STAT_KEYS.includes(item.stat) || !positiveInt(item.scale) || typeof item.label !== 'string')) errors.push('economy: invalid gearStats');
  for (const type of Object.values(content.gearTypes)) {
    if (!positiveInt(type.points) || !positiveInt(type.statCount) || type.statCount > (rules.gearStats?.length ?? 0)) errors.push(`gearTypes: invalid ${type.id}`);
  }
  for (const banner of Object.values(content.banners)) {
    if (!positiveInt(banner.gearWeight) || !positiveInt(banner.characterWeight)) errors.push(`banners: invalid weights ${banner.id}`);
    if (!Array.isArray(banner.characterPool) || !banner.characterPool.length
      || new Set(banner.characterPool).size !== banner.characterPool.length
      || banner.characterPool.some(id => !Object.hasOwn(content.characters, id) || rules.starterCharacters?.includes(id))) errors.push(`banners: invalid characterPool ${banner.id}`);
    if (!Array.isArray(banner.gearRates) || !banner.gearRates.length
      || new Set(banner.gearRates.map(item => item.typeId)).size !== banner.gearRates.length
      || banner.gearRates.some(item => !Object.hasOwn(content.gearTypes, item.typeId) || !positiveInt(item.weight))) errors.push(`banners: invalid gearRates ${banner.id}`);
  }
  return errors;
}

export function validateGear(gear, content) {
  const type = Object.hasOwn(content.gearTypes, gear?.typeId) ? content.gearTypes[gear.typeId] : null;
  if (!type || typeof gear.id !== 'string' || !/^gear_[1-9]\d*$/.test(gear.id)
    || !gear.stats || typeof gear.stats !== 'object' || Array.isArray(gear.stats)) return false;
  const entries = Object.entries(gear.stats);
  return entries.length === type.statCount && entries.every(([key, value]) => {
    const definition = economyRules(content).gearStats.find(item => item.stat === key);
    return definition && value === definition.scale * type.points;
  });
}

function checkedAdd(value, amount) {
  if (!Number.isSafeInteger(value) || value < 0 || !Number.isSafeInteger(value + amount)) throw new Error('Số dư vượt giới hạn cho phép.');
  return value + amount;
}

// A failed persistence callback leaves both campaign and claim unchanged for a retry.
export function claimBattleReward(campaign, battle, content, persist = () => {}) {
  if (battle.outcome !== 'victory' || battle.rewardClaimed) return campaign;
  const next = structuredClone(campaign);
  next.coins = checkedAdd(next.coins, economyRules(content).victoryCoins);
  next.victories = checkedAdd(next.victories, 1);
  persist(next);
  battle.rewardClaimed = true;
  return next;
}

function roll(random) {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('Nguồn ngẫu nhiên không hợp lệ.');
  return value;
}

function weighted(items, random) {
  let cursor = roll(random) * items.reduce((sum, item) => sum + item.weight, 0);
  for (const item of items) {
    cursor -= item.weight;
    if (cursor < 0) return item;
  }
  return items.at(-1);
}

// Pure transaction: persist the complete result before replacing live campaign state.
export function pullGacha(campaign, content, bannerId, count, random = Math.random) {
  const banner = Object.hasOwn(content.banners, bannerId) ? content.banners[bannerId] : null;
  if (!banner || ![1, 10].includes(count)) throw new Error('Lượt quay không hợp lệ.');
  const rules = economyRules(content);
  const cost = count === 10 ? rules.tenPullCost : rules.singlePullCost;
  if (!Number.isSafeInteger(campaign.coins) || campaign.coins < cost) throw new Error('Không đủ coin.');
  const next = structuredClone(campaign);
  next.coins -= cost;
  const results = [];
  for (let index = 0; index < count; index += 1) {
    next.gacha.totalPulls = checkedAdd(next.gacha.totalPulls, 1);
    const character = roll(random) >= banner.gearWeight / (banner.gearWeight + banner.characterWeight);
    if (character) {
      const characterId = banner.characterPool[Math.floor(roll(random) * banner.characterPool.length)];
      const duplicate = ownsCharacter(next, characterId);
      let slotUnlocked = false;
      if (duplicate) {
        next.recruitmentShards = checkedAdd(next.recruitmentShards, rules.duplicateShards);
        slotUnlocked = unlockDuplicateSlot(next, content, characterId);
      }
      else unlockCharacter(next, content, characterId);
      results.push({ kind: 'character', characterId, duplicate, shards: duplicate ? rules.duplicateShards : 0, slotUnlocked, gearSlots: gearSlotCapacity(next, content, characterId) });
    } else {
      const type = content.gearTypes[weighted(banner.gearRates, random).typeId];
      const pool = [...rules.gearStats];
      const stats = {};
      for (let slot = 0; slot < type.statCount; slot += 1) {
        const [definition] = pool.splice(Math.floor(roll(random) * pool.length), 1);
        stats[definition.stat] = definition.scale * type.points;
      }
      const gear = { id: `gear_${next.gacha.totalPulls}`, typeId: type.id, stats };
      next.gear.push(gear);
      results.push({ kind: 'gear', gear: structuredClone(gear) });
    }
  }
  return { campaign: next, results };
}

export function recruitCharacter(campaign, content, bannerId, id) {
  const banner = Object.hasOwn(content.banners, bannerId) ? content.banners[bannerId] : null;
  if (!banner?.characterPool.includes(id) || ownsCharacter(campaign, id)) throw new Error('Nhân vật không thể chiêu mộ.');
  const cost = economyRules(content).recruitCost;
  if (!Number.isSafeInteger(campaign.recruitmentShards) || campaign.recruitmentShards < cost) throw new Error('Không đủ mảnh chiêu mộ.');
  const next = structuredClone(campaign);
  next.recruitmentShards -= cost;
  unlockCharacter(next, content, id);
  return next;
}
