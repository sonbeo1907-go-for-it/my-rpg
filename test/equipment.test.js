import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/load-content.mjs';
import { createCampaign, resolveCharacter, serializeCampaign, deserializeCampaign } from '../src/core/progression.js';
import { equipGear, unequipGear, gearOwner } from '../src/core/equipment.js';
import { effectiveStat } from '../src/core/combat-math.js';
import { createBattle, getActor, executeAction } from '../src/core/battle.js';
import { skillScaling } from '../src/ui/skill-presentation.js';
import { gearSlotCapacity } from '../src/core/gear-slots.js';
import { pullGacha } from '../src/core/economy.js';

const content = await loadContent();
function setup() {
  const campaign = createCampaign(content);
  campaign.unlockedCharacterIds.push('lisbeth', 'aurora', 'armie');
  campaign.gacha.totalPulls = 4;
  campaign.gear = [
    { id: 'gear_1', typeId: 't3_focused', stats: { magic: 5 } },
    { id: 'gear_2', typeId: 't2', stats: { attack: 3 } },
    { id: 'gear_3', typeId: 't3_dual', stats: { maxHp: 10, maxMp: 4 } },
    { id: 'gear_4', typeId: 't3_focused', stats: { speed: 5 } }
  ];
  return campaign;
}
const restore = campaign => deserializeCampaign(serializeCampaign(campaign), content);

test('equip, replace, transfer and unequip preserve immutable inventory instances and one owner per gear', () => {
  const original = setup();
  const first = equipGear(original, content, 'arthur', 'gear_1');
  assert.deepEqual(original.equipment, {});
  assert.deepEqual(first.equipment, { arthur: ['gear_1', null, null] });
  assert.equal(equipGear(first, content, 'arthur', 'gear_1'), first);
  const second = equipGear(first, content, 'arthur', 'gear_2');
  assert.equal(gearOwner(second, 'gear_1'), null);
  const third = equipGear(second, content, 'elaine', 'gear_1');
  const transfer = equipGear(third, content, 'elaine', 'gear_2');
  assert.deepEqual(transfer.equipment, { elaine: ['gear_2', null, null] });
  assert.deepEqual(transfer.gear, original.gear);
  assert.deepEqual(second.equipment, { arthur: ['gear_2', null, null] });
  const removed = unequipGear(transfer, content, 'elaine');
  assert.deepEqual(removed.equipment, {});
  assert.equal(unequipGear(removed, content, 'elaine'), removed);
  assert.deepEqual(removed.gear, original.gear);
  assert.deepEqual(restore(transfer), transfer);
});

test('locked heroes and missing/invalid gear cannot be equipped; invalid saves and battles are rejected', () => {
  const campaign = setup();
  const before = serializeCampaign(campaign);
  assert.throws(() => equipGear(campaign, content, 'freya', 'gear_1'), /mở khóa/);
  assert.throws(() => unequipGear(campaign, content, 'freya'), /mở khóa/);
  assert.throws(() => equipGear(campaign, content, '__proto__', 'gear_1'));
  assert.throws(() => equipGear(campaign, content, 'arthur', 'missing'));
  assert.equal(serializeCampaign(campaign), before);
  for (const equipment of [null, [], 'bad', { missing: 'gear_1' }, { freya: 'gear_1' }, { arthur: 'missing' }, { arthur: null }, { arthur: 'gear_1', elaine: 'gear_1' }]) {
    const invalid = { ...campaign, equipment };
    assert.throws(() => restore(invalid));
    assert.throws(() => createBattle(content, invalid, 'forest_patrol'));
  }
});

test('older v2 saves without equipment retain gear, coins and progress with every item unequipped', () => {
  const campaign = setup();
  campaign.coins = 735; campaign.version = 2;
  delete campaign.equipment;
  const restored = deserializeCampaign(JSON.stringify(campaign), content);
  assert.deepEqual(restored.equipment, {});
  assert.deepEqual(restored.gear, campaign.gear);
  assert.equal(restored.coins, 735);
  assert.equal(restored.version, 3);
});

test('gear contributes before permanent and temporary percentages without accumulating across saves or resolutions', () => {
  const originalDefinition = JSON.stringify(content.characters.lisbeth);
  let campaign = equipGear(setup(), content, 'lisbeth', 'gear_1');
  campaign.party = ['lisbeth'];
  for (let i = 0; i < 3; i++) {
    campaign = restore(campaign);
    const actor = resolveCharacter(content, campaign, 'lisbeth');
    assert.equal(actor.baseStats.magic, 47);
    assert.ok(Math.abs(actor.stats.magic - 56.4) < 1e-9);
    assert.ok(Math.abs(effectiveStat(actor, 'magic', .5) - 79.9) < 1e-9);
    assert.equal(campaign.characters.lisbeth.stats, undefined);
    const battle = createBattle(content, campaign, 'ogre_trial');
    executeAction(battle, { actorId: 'lisbeth', abilityId: 'lisbeth.pride', targetId: 'lisbeth' });
    battle.cursor = battle.queue.indexOf('lisbeth');
    executeAction(battle, { actorId: 'lisbeth', abilityId: 'lisbeth.judgment', targetId: 'enemy_0' });
    assert.equal(battle.events.find(event => event.type === 'damage').amount, 317);
  }
  assert.equal(JSON.stringify(content.characters.lisbeth), originalDefinition);
});

test('equipped MAG changes shield/heal preview and actual battle output using the same rounding', () => {
  const campaign = equipGear(setup(), content, 'elaine', 'gear_1');
  campaign.party = ['elaine'];
  const actor = resolveCharacter(content, campaign, 'elaine');
  assert.match(skillScaling(content.abilities['elaine.shield'], actor, content).join('\n'), /63 khiên/);
  const battle = createBattle(content, campaign, 'forest_patrol');
  executeAction(battle, { actorId: 'elaine', abilityId: 'elaine.shield', targetId: 'elaine' });
  assert.equal(getActor(battle, 'elaine').shield, 63);
  const healer = equipGear(campaign, content, 'armie', 'gear_1');
  healer.party = ['armie', 'garrek'];
  const healingBattle = createBattle(content, healer, 'forest_patrol');
  getActor(healingBattle, 'garrek').hp = 1;
  executeAction(healingBattle, { actorId: 'armie', abilityId: 'armie.first_aid', targetId: 'garrek' });
  assert.equal(getActor(healingBattle, 'garrek').hp, 68); // round(37 × 1.8) = 67.
});

test('HP/MP gear starts battle at increased maxima and Aurora restores the increased max MP', () => {
  const campaign = equipGear(setup(), content, 'aurora', 'gear_3');
  campaign.party = ['arthur', 'aurora'];
  const battle = createBattle(content, campaign, 'forest_patrol');
  const aurora = getActor(battle, 'aurora');
  assert.equal(aurora.hp, 150);
  assert.equal(aurora.mp, 104);
  aurora.mp = 0;
  aurora.resourceValues.thunder_charge = 2;
  battle.queue = ['arthur', 'aurora']; battle.cursor = 0;
  executeAction(battle, { actorId: 'arthur', abilityId: '$defend', targetId: 'arthur' });
  assert.equal(aurora.mp, 21); // round(104 × 20%).
  assert.equal(aurora.resourceValues.thunder_charge, 0);
});

test('equipped SPD changes initiative and gear changes only affect new battle snapshots', () => {
  const campaign = setup(); campaign.party = ['iris', 'aurora'];
  const old = createBattle(content, campaign, 'forest_patrol');
  assert.equal(old.queue[0], 'iris');
  const next = equipGear(campaign, content, 'aurora', 'gear_4');
  const fresh = createBattle(content, next, 'forest_patrol');
  assert.equal(fresh.queue[0], 'aurora');
  assert.equal(getActor(old, 'aurora').stats.speed, 19);
  assert.equal(getActor(fresh, 'aurora').stats.speed, 24);
  const removed = unequipGear(next, content, 'aurora');
  assert.equal(resolveCharacter(content, removed, 'aurora').stats.speed, 19);
  assert.equal(getActor(fresh, 'aurora').stats.speed, 24);
});

test('three default slots sum all gear before passives; own moves free source and return replaced gear', () => {
  let campaign = setup();
  for (let i = 1; i <= 3; i++) campaign = equipGear(campaign, content, 'lisbeth', `gear_${i}`, i - 1);
  assert.equal(gearSlotCapacity(campaign, content, 'lisbeth'), 3);
  const actor = resolveCharacter(content, campaign, 'lisbeth');
  assert.deepEqual(actor.gearBonuses, { magic: 5, attack: 3, maxHp: 10, maxMp: 4 });
  assert.equal(actor.stats.maxHp, 120);
  assert.equal(actor.stats.maxMp, 94);
  assert.ok(Math.abs(actor.stats.magic - 56.4) < 1e-9);
  assert.throws(() => equipGear(campaign, content, 'lisbeth', 'gear_4', 3), /chưa mở/);
  assert.throws(() => unequipGear(campaign, content, 'lisbeth', -1), /không hợp lệ/);
  const moved = equipGear(campaign, content, 'lisbeth', 'gear_3', 1);
  assert.deepEqual(moved.equipment.lisbeth, ['gear_1', 'gear_3', null]);
  assert.equal(gearOwner(moved, 'gear_2'), null);
  assert.deepEqual(restore(moved), moved);
  assert.deepEqual(campaign.equipment.lisbeth, ['gear_1', 'gear_2', 'gear_3']);
});

test('three duplicates unlock slots 4/5/6, later duplicates only grant shards, and six pieces stack once', () => {
  const original = setup(); original.coins = 1000;
  const outcome = pullGacha(original, content, 'standard', 10, () => .999);
  assert.deepEqual(outcome.results.map(result => result.gearSlots), [4, 5, 6, 6, 6, 6, 6, 6, 6, 6]);
  assert.deepEqual(outcome.results.map(result => result.slotUnlocked), [true, true, true, false, false, false, false, false, false, false]);
  assert.equal(outcome.campaign.recruitmentShards, 100);
  assert.deepEqual(outcome.campaign.extraGearSlots, { lisbeth: 3 });
  assert.deepEqual(original.extraGearSlots, {});
  assert.equal(gearSlotCapacity(outcome.campaign, content, 'arthur'), 3);
  let campaign = outcome.campaign;
  campaign.gear = Array.from({ length: 6 }, (_, i) => ({ id: `gear_${i + 1}`, typeId: 't3_focused', stats: { magic: 5 } }));
  for (let slot = 0; slot < 6; slot++) campaign = equipGear(campaign, content, 'lisbeth', `gear_${slot + 1}`, slot);
  campaign = restore(campaign);
  const actor = resolveCharacter(content, campaign, 'lisbeth');
  assert.deepEqual(actor.gearBonuses, { magic: 30 });
  assert.equal(actor.baseStats.magic, 72);
  assert.ok(Math.abs(actor.stats.magic - 86.4) < 1e-9);
  assert.ok(Math.abs(effectiveStat(actor, 'magic', .5) - 122.4) < 1e-9);
  assert.throws(() => equipGear(campaign, content, 'lisbeth', 'gear_1', 6), /chưa mở/);
  campaign = unequipGear(campaign, content, 'lisbeth', 5);
  assert.equal(resolveCharacter(content, campaign, 'lisbeth').gearBonuses.magic, 25);
  assert.equal(gearSlotCapacity(campaign, content, 'lisbeth'), 6);
});

test('new recruits start at three slots and duplicate expansion is limited to the duplicated hero within a batch', () => {
  const campaign = setup(); campaign.coins = 1000;
  let cursor = 0;
  const outcome = pullGacha(campaign, content, 'standard', 10, () => cursor++ % 2 === 0 ? .95 : 0);
  assert.deepEqual(outcome.results.slice(0, 4).map(item => item.gearSlots), [3, 4, 5, 6]);
  assert.equal(outcome.results[0].slotUnlocked, false);
  assert.deepEqual(outcome.campaign.extraGearSlots, { dain: 3 });
  assert.equal(gearSlotCapacity(outcome.campaign, content, 'lisbeth'), 3);
  assert.equal(outcome.campaign.recruitmentShards, 90);
});

test('v2 single-slot gear migrates into slot 1 without guessing old dupes from shared shards', () => {
  const old = setup(); old.version = 2;
  old.equipment = { lisbeth: 'gear_1' };
  old.recruitmentShards = 200;
  old.coins = 400;
  const migrated = restore(old);
  assert.equal(migrated.version, 3);
  assert.deepEqual(migrated.equipment, { lisbeth: ['gear_1'] });
  assert.deepEqual(migrated.extraGearSlots, {});
  assert.equal(migrated.coins, 400);
  assert.equal(migrated.recruitmentShards, 200);
  assert.equal(resolveCharacter(content, migrated, 'lisbeth').gearBonuses.magic, 5);
  assert.deepEqual(restore(migrated), migrated);
});

test('v3 rejects illegal unlock counts, over-capacity arrays and reused gear within or between heroes', () => {
  for (const extras of [null, [], { lisbeth: -1 }, { lisbeth: 4 }, { lisbeth: 1.5 }, { freya: 1 }, { unknown: 1 }]) {
    const campaign = setup(); campaign.extraGearSlots = extras;
    assert.throws(() => restore(campaign));
    assert.throws(() => createBattle(content, campaign, 'forest_patrol'));
  }
  for (const equipment of [{ lisbeth: ['gear_1', 'gear_1'] }, { lisbeth: ['gear_1'], arthur: ['gear_1'] }, { lisbeth: [null, null, null, 'gear_1'] }, { lisbeth: 'gear_1' }]) {
    const campaign = setup(); campaign.equipment = equipment;
    assert.throws(() => restore(campaign));
    assert.throws(() => createBattle(content, campaign, 'forest_patrol'));
  }
});
