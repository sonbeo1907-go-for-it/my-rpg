import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/load-content.mjs';
import { validateContent } from '../src/core/content.js';
import { createCampaign, serializeCampaign, deserializeCampaign, completeStoryEvent } from '../src/core/progression.js';
import { ownsCharacter, unlockCharacter } from '../src/core/ownership.js';
import { assignPartySlot } from '../src/core/party.js';
import { createBattle } from '../src/core/battle.js';
import { pullGacha, claimBattleReward, recruitCharacter } from '../src/core/economy.js';

const content = await loadContent();
const sequence = values => { let index = 0; return () => { assert.ok(index < values.length, 'unexpected RNG call'); return values[index++]; }; };
const funded = (coins = 1000) => Object.assign(createCampaign(content), { coins });
const restore = campaign => deserializeCampaign(serializeCampaign(campaign), content);

test('v2 starts with exactly six owned heroes; locked characters cannot enter a party or battle', () => {
  const campaign = createCampaign(content);
  assert.equal(campaign.version, 2);
  assert.deepEqual(campaign.unlockedCharacterIds, ['arthur', 'iris', 'takeshi', 'elaine', 'garrek', 'fiona']);
  assert.equal(campaign.coins, 0);
  assert.equal(ownsCharacter(campaign, 'aurora'), false);
  assert.throws(() => assignPartySlot(campaign.party, 0, 'aurora', campaign), /chưa mở khóa/);
  campaign.party = ['aurora'];
  assert.throws(() => createBattle(content, campaign, 'forest_patrol'), /chưa mở khóa/);
  assert.throws(() => restore(campaign), /chưa mở khóa/);
  assert.equal(unlockCharacter(campaign, content, 'aurora'), true);
  assert.equal(unlockCharacter(campaign, content, 'aurora'), false);
  assert.ok(createBattle(content, campaign, 'forest_patrol'));
});

test('v1 migration grants old victory coins once, locks non-starters, preserves slots and story upgrades', () => {
  const old = createCampaign(content);
  old.version = 1;
  old.victories = 4;
  old.party = ['lisbeth', 'arthur', null, 'aurora'];
  completeStoryEvent(old, content, 'arthur_completed_sword_training');
  const next = restore(old);
  assert.equal(next.version, 2);
  assert.equal(next.coins, 400);
  assert.deepEqual(next.party, [null, 'arthur', null, null]);
  assert.equal(ownsCharacter(next, 'lisbeth'), false);
  assert.deepEqual(next.characters.arthur.upgradeIds, ['arthur.control_training']);
  next.coins -= 100;
  assert.deepEqual(restore(next), next); // No second migration credit.
  old.party = ['lisbeth'];
  assert.deepEqual(restore(old).party, createCampaign(content).party);
});

test('save v2 validates balances, ownership, gear rolls and unique instance IDs without leaking battle state', () => {
  const good = pullGacha(funded(), content, 'standard', 1, sequence([0, .99, 0, 0])).campaign;
  assert.deepEqual(good.gear[0].stats, { maxHp: 10, maxMp: 4 });
  good.battle = { hp: 5 };
  assert.equal('battle' in JSON.parse(serializeCampaign(good)), false);
  delete good.battle;
  assert.deepEqual(restore(good), good);
  for (const corrupt of [
    value => { value.coins = -1; },
    value => { value.coins = 1.5; },
    value => { value.recruitmentShards = Number.MAX_SAFE_INTEGER + 1; },
    value => { value.unlockedCharacterIds.push('unknown'); },
    value => { value.unlockedCharacterIds.push('arthur'); },
    value => { value.unlockedCharacterIds = []; },
    value => { value.gear[0].stats.maxHp = 999; },
    value => { value.gear[0].stats = { attack: 2 }; },
    value => { value.gear[0].typeId = 'unknown'; },
    value => { value.gear.push(structuredClone(value.gear[0])); },
    value => { value.gacha.totalPulls = 0; },
    value => { value.gear[0] = null; }
  ]) {
    const invalid = structuredClone(good);
    corrupt(invalid);
    assert.throws(() => restore(invalid));
  }
});

test('victory grants 100 coins once; failed, drawn, unfinished battles grant nothing', () => {
  let campaign = createCampaign(content);
  for (const outcome of [null, 'draw', 'defeat']) assert.equal(claimBattleReward(campaign, { outcome }, content), campaign);
  const battle = { outcome: 'victory' };
  let writes = 0;
  campaign = claimBattleReward(campaign, battle, content, next => { writes++; assert.equal(next.coins, 100); });
  assert.equal(campaign.coins, 100);
  assert.equal(campaign.victories, 1);
  assert.equal(claimBattleReward(campaign, battle, content), campaign);
  assert.equal(writes, 1);
  const secondBattle = { outcome: 'victory' };
  assert.equal(claimBattleReward(campaign, secondBattle, content).coins, 200);
});

test('a failed reward save leaves the reward claim retryable and overflow never partly grants coins', () => {
  const original = createCampaign(content);
  const battle = { outcome: 'victory' };
  assert.throws(() => claimBattleReward(original, battle, content, () => { throw new Error('quota'); }), /quota/);
  assert.equal(original.coins, 0);
  assert.equal(battle.rewardClaimed, undefined);
  assert.equal(claimBattleReward(original, battle, content).coins, 100);
  const full = funded(Number.MAX_SAFE_INTEGER);
  assert.throws(() => claimBattleReward(full, { outcome: 'victory' }, content), /giới hạn/);
  assert.equal(full.victories, 0);
});

test('90/10 boundary and uniform character pool unlock the first and last characters; duplicates give shards', () => {
  const original = funded();
  const first = pullGacha(original, content, 'standard', 1, sequence([.9, 0]));
  assert.equal(first.results[0].characterId, 'dain');
  assert.equal(first.results[0].duplicate, false);
  assert.equal(ownsCharacter(first.campaign, 'dain'), true);
  assert.equal(ownsCharacter(original, 'dain'), false);
  assert.equal(first.campaign.coins, 900);
  const duplicate = pullGacha(first.campaign, content, 'standard', 1, sequence([.999, 0]));
  assert.equal(duplicate.campaign.recruitmentShards, 10);
  assert.equal(duplicate.campaign.unlockedCharacterIds.length, 7);
  assert.equal(duplicate.results[0].duplicate, true);
  const last = pullGacha(original, content, 'standard', 1, sequence([.999, .999]));
  assert.equal(last.results[0].characterId, 'lisbeth');
  assert.deepEqual(restore(duplicate.campaign), duplicate.campaign);
  assert.equal(pullGacha(original, content, 'standard', 1, sequence([.899999, 0, 0])).results[0].kind, 'gear');
});

test('gear tier boundaries, HP/MP conversion and distinct random stats match data', () => {
  for (const [roll, typeId, stats] of [
    [0, 't1', { maxHp: 5 }],
    [.59999, 't1', { maxHp: 5 }],
    [.6, 't2', { maxHp: 15 }],
    [.9, 't3_focused', { maxHp: 25 }],
    [.98, 't3_dual', { maxHp: 10, maxMp: 4 }]
  ]) {
    const values = typeId === 't3_dual' ? [0, roll, 0, 0] : [0, roll, 0];
    const outcome = pullGacha(funded(), content, 'standard', 1, sequence(values));
    assert.equal(outcome.results[0].gear.typeId, typeId);
    assert.deepEqual(outcome.results[0].gear.stats, stats);
    assert.deepEqual(restore(outcome.campaign), outcome.campaign);
  }
  const speed = pullGacha(funded(), content, 'standard', 1, sequence([0, .91, .999]));
  assert.deepEqual(speed.campaign.gear[0].stats, { speed: 5 });
});

test('ten pulls are independent, can contain only gear, and allocate unique IDs across later pulls', () => {
  const original = funded(1100);
  const ten = pullGacha(original, content, 'standard', 10, () => 0);
  assert.equal(ten.campaign.coins, 100);
  assert.equal(ten.results.length, 10);
  assert.ok(ten.results.every(item => item.kind === 'gear'));
  assert.equal(ten.campaign.gacha.totalPulls, 10);
  const one = pullGacha(ten.campaign, content, 'standard', 1, () => 0);
  assert.equal(one.campaign.gear.at(-1).id, 'gear_11');
  assert.equal(new Set(one.campaign.gear.map(item => item.id)).size, 11);
  assert.equal(original.coins, 1100);
  assert.equal(original.gear.length, 0);
});

test('duplicates within a ten-pull batch become shards and can redeem exactly one locked character', () => {
  const outcome = pullGacha(funded(), content, 'standard', 10, sequence(Array.from({ length: 10 }, () => [.95, 0]).flat()));
  assert.equal(outcome.results.filter(item => !item.duplicate).length, 1);
  assert.equal(outcome.campaign.recruitmentShards, 90);
  outcome.campaign.coins = 100;
  const last = pullGacha(outcome.campaign, content, 'standard', 1, sequence([.95, 0])).campaign;
  const redeemed = recruitCharacter(last, content, 'standard', 'lisbeth');
  assert.equal(redeemed.recruitmentShards, 0);
  assert.equal(ownsCharacter(redeemed, 'lisbeth'), true);
  assert.equal(last.recruitmentShards, 100);
  assert.throws(() => recruitCharacter(redeemed, content, 'standard', 'lisbeth'));
  assert.throws(() => recruitCharacter(redeemed, content, 'standard', 'aurora'), /Không đủ/);
  assert.throws(() => recruitCharacter(last, content, 'standard', 'arthur'));
  assert.deepEqual(restore(redeemed), redeemed);
});

test('insufficient funds, invalid commands or broken RNG never modify the original campaign', () => {
  const campaign = funded(999);
  const before = serializeCampaign(campaign);
  let calls = 0;
  assert.throws(() => pullGacha(campaign, content, 'standard', 10, () => { calls++; return 0; }), /Không đủ coin/);
  assert.equal(calls, 0);
  for (const count of [0, 2, -1, '10']) assert.throws(() => pullGacha(campaign, content, 'standard', count));
  assert.throws(() => pullGacha(campaign, content, 'missing', 1));
  assert.throws(() => pullGacha(campaign, content, 'standard', 1, sequence([0, NaN])));
  assert.equal(serializeCampaign(campaign), before);
});

test('economy content validation catches invalid prices, pools, weights and gear definitions', () => {
  for (const corrupt of [
    value => { value.economy.default.singlePullCost = 0; },
    value => { value.banners.standard.characterPool.push('unknown'); },
    value => { value.banners.standard.characterPool.push('arthur'); },
    value => { value.banners.standard.gearWeight = -90; },
    value => { value.banners.standard.gearRates[0].typeId = 'missing'; },
    value => { value.gearTypes.t3_dual.statCount = 8; },
    value => { value.economy.default.gearStats[0].scale = -5; }
  ]) {
    const invalid = structuredClone(content);
    corrupt(invalid);
    assert.ok(validateContent(invalid).length);
  }
});
