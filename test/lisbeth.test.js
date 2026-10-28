import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/load-content.mjs';
import { validateContent } from '../src/core/content.js';
import { effectiveStat } from '../src/core/combat-math.js';
import { createCampaign, resolveCharacter, serializeCampaign, deserializeCampaign } from '../src/core/progression.js';
import { createBattle, getActor, executeAction } from '../src/core/battle.js';
import { passiveDescription, skillScaling } from '../src/ui/skill-presentation.js';

const content = await loadContent();
function setup(party = ['lisbeth']) {
  const campaign = createCampaign(content);
  campaign.party = party;
  campaign.unlockedCharacterIds.push('lisbeth', 'aurora');
  return createBattle(content, campaign, 'ogre_trial', () => 0.99);
}
function use(battle, actorId, abilityId, targetId = actorId) {
  battle.cursor = battle.queue.indexOf(actorId);
  executeAction(battle, { actorId, abilityId, targetId });
}
const impact = battle => battle.events.find(event => event.type === 'damage' && event.sourceId === 'lisbeth');

test('Lisbeth has Light magic, Ranoc background, low HP, and 42 base MAG', () => {
  const actor = content.characters.lisbeth;
  assert.equal(actor.element, 'light');
  assert.equal(actor.affiliation, 'House Ranoc');
  assert.equal(actor.basicDamageType, 'magical');
  assert.equal(actor.roleGroup, 'magical_dps');
  assert.equal(actor.stats.magic, 42);
  assert.equal(actor.stats.maxHp, 110);
  assert.ok(actor.stats.maxHp < content.characters.fiona.stats.maxHp);
  assert.match(actor.description, /tổ tiên lập khế ước với quỷ/);
  assert.match(actor.description, /tsundere/);
});

test('the permanent 20% MAG applies exactly once in resolution, saves and new battles', () => {
  const campaign = createCampaign(content);
  campaign.party = ['lisbeth'];
  campaign.unlockedCharacterIds.push('lisbeth');
  const definitionBefore = JSON.stringify(content.characters.lisbeth);
  for (let i = 0; i < 3; i += 1) {
    const resolved = resolveCharacter(content, campaign, 'lisbeth');
    assert.equal(resolved.baseStats.magic, 42);
    assert.ok(Math.abs(resolved.stats.magic - 50.4) < 1e-9);
    const restored = deserializeCampaign(serializeCampaign(campaign), content);
    const battle = createBattle(content, restored, 'ogre_trial');
    assert.ok(Math.abs(getActor(battle, 'lisbeth').stats.magic - 50.4) < 1e-9);
    assert.equal('baseStats' in restored.characters.lisbeth, false);
  }
  assert.equal(JSON.stringify(content.characters.lisbeth), definitionBefore);
});

test('self-buff and permanent MAG add on the same base, last three attacks, then expire', () => {
  const battle = setup();
  const target = getActor(battle, 'enemy_0');
  target.hp = 2000; target.stats.maxHp = 2000;
  use(battle, 'lisbeth', 'lisbeth.pride');
  assert.ok(Math.abs(effectiveStat(getActor(battle, 'lisbeth'), 'magic', 0.5) - 71.4) < 1e-9);
  for (let i = 0; i < 3; i += 1) {
    use(battle, 'lisbeth', 'lisbeth.lance', 'enemy_0');
    assert.equal(impact(battle).amount, 185);
  }
  assert.ok(!getActor(battle, 'lisbeth').statuses.some(status => status.id === 'ranoc_pride'));
  use(battle, 'lisbeth', 'lisbeth.lance', 'enemy_0');
  assert.equal(impact(battle).amount, 125);
  assert.equal(getActor(battle, 'lisbeth').mp, 14);
});

test('the costly burst hits one enemy with magical Light damage and respects cooldown', () => {
  const battle = setup();
  use(battle, 'lisbeth', 'lisbeth.pride');
  use(battle, 'lisbeth', 'lisbeth.judgment', 'enemy_0');
  assert.equal(impact(battle).amount, 281);
  assert.equal(impact(battle).element, 'light');
  assert.equal(impact(battle).weakness, true);
  assert.equal(getActor(battle, 'enemy_1').hp, getActor(battle, 'enemy_1').stats.maxHp);
  assert.equal(getActor(battle, 'lisbeth').mp, 50);
  assert.throws(() => use(battle, 'lisbeth', 'lisbeth.judgment', 'enemy_0'), /Hồi chiêu/);
  assert.equal(getActor(battle, 'lisbeth').mp, 50);
});

test('insufficient MP rejects a burst without changing state', () => {
  const battle = setup();
  const actor = getActor(battle, 'lisbeth');
  actor.mp = 27;
  const before = JSON.stringify({ actor, log: battle.log, events: battle.events, cursor: battle.cursor });
  assert.throws(() => executeAction(battle, { actorId: 'lisbeth', abilityId: 'lisbeth.judgment', targetId: 'enemy_0' }), /Không đủ MP/);
  assert.equal(JSON.stringify({ actor, log: battle.log, events: battle.events, cursor: battle.cursor }), before);
});

test('Aurora buffs add correctly and follows Lisbeth’s single-target magic under the global rule', () => {
  const battle = setup(['aurora', 'lisbeth']);
  use(battle, 'aurora', 'aurora.amplify', 'lisbeth');
  assert.equal(getActor(battle, 'aurora').resourceValues.thunder_charge, 0);
  use(battle, 'lisbeth', 'lisbeth.pride');
  use(battle, 'lisbeth', 'lisbeth.lance', 'enemy_0');
  assert.equal(impact(battle).amount, 215);
  assert.equal(getActor(battle, 'aurora').resourceValues.thunder_charge, 1);
  assert.deepEqual(battle.events.filter(event => event.type === 'damage').map(event => event.sourceId), ['lisbeth', 'aurora']);
});

test('preview reports innate MAG and skill scaling, and old saves gain Lisbeth safely', () => {
  const campaign = createCampaign(content);
  const actor = resolveCharacter(content, campaign, 'lisbeth');
  assert.match(passiveDescription(actor, content), /\+20% MAG.*42 cơ bản → 50,4/);
  assert.match(skillScaling(content.abilities['lisbeth.lance'], actor, content).join('\n'), /190% MAG/);
  assert.match(skillScaling(content.abilities['lisbeth.judgment'], actor, content).join('\n'), /280% MAG/);
  delete campaign.characters.lisbeth;
  const restored = deserializeCampaign(serializeCampaign(campaign), content);
  assert.deepEqual(restored.characters.lisbeth, { level: 1, upgradeIds: [] });
  assert.deepEqual(restored.party, campaign.party);
});

test('permanent stat boost data rejects missing, unknown or nonnumeric modifiers', () => {
  for (const modifiers of [null, {}, { unknown_stat: 0.2 }, { magic: '20%' }, { maxHp: 0.2 }]) {
    const broken = structuredClone(content);
    broken.characters.lisbeth.passive.modifiers = modifiers;
    assert.match(validateContent(broken).join('\n'), /stat boost|permanent stat modifier/);
  }
});
