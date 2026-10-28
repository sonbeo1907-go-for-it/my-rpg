import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/load-content.mjs';
import { validateContent } from '../src/core/content.js';
import { createCampaign, deserializeCampaign, serializeCampaign } from '../src/core/progression.js';
import { createBattle, getActor, activeActor, executeAction } from '../src/core/battle.js';
import { passiveDescription, skillScaling } from '../src/ui/skill-presentation.js';

const content = await loadContent();
function setup(party = ['iris', 'aurora', 'fiona', 'elaine'], source = content) {
  const campaign = createCampaign(source);
  campaign.party = party;
  campaign.unlockedCharacterIds = Object.keys(source.characters); // Combat fixture: roster already recruited.
  return createBattle(source, campaign, 'forest_patrol', () => 0.99);
}
function use(battle, actorId, abilityId, targetId = actorId) {
  battle.cursor = battle.queue.indexOf(actorId);
  assert.ok(battle.cursor >= 0);
  executeAction(battle, { actorId, abilityId, targetId });
}
const charges = battle => getActor(battle, 'aurora').resourceValues.thunder_charge;
const followups = battle => battle.events.filter(event => event.type === 'damage' && event.sourceId === 'aurora');

test('Aurora is a Thunder Academy offensive support and magical sub-DPS with a passive skill preview', () => {
  const actor = content.characters.aurora;
  assert.equal(actor.element, 'thunder');
  assert.equal(actor.affiliation, 'Magic Academy');
  assert.equal(actor.roleGroup, 'offensive_support');
  assert.ok(actor.secondaryRoleGroups.includes('magical_dps'));
  assert.match(passiveDescription(actor, content), /80% MAG hệ THUNDER/);
  assert.match(passiveDescription(actor, content), /20% MP tối đa/);
  assert.match(skillScaling(content.abilities[actor.passive.followUpAbility], actor, content).join('\n'), /80% MAG/);
});

test('single-target magic causes one free follow-up and one charge without taking Aurora’s turn', () => {
  const battle = setup();
  const aurora = getActor(battle, 'aurora');
  use(battle, 'iris', '$attack', 'enemy_0');
  assert.equal(charges(battle), 1);
  assert.equal(followups(battle).length, 1);
  assert.equal(followups(battle)[0].targetId, 'enemy_0');
  assert.equal(followups(battle)[0].element, 'thunder');
  assert.equal(followups(battle)[0].amount, 23);
  assert.equal(followups(battle)[0].weakness, true);
  assert.equal(aurora.mp, aurora.stats.maxMp);
  assert.equal(battle.actionCount, 1);
  assert.equal(activeActor(battle).id, 'elaine');
  use(battle, 'fiona', 'fiona.shard', 'enemy_2');
  assert.equal(charges(battle), 1);
  assert.equal(followups(battle).length, 0);
});

test('Aurora’s own single-target spell cannot trigger or spend her follow-up activation', () => {
  const battle = setup();
  use(battle, 'aurora', 'aurora.spark', 'enemy_2');
  assert.equal(followups(battle).length, 1); // Only the active spell.
  assert.equal(charges(battle), 0);
  assert.equal(getActor(battle, 'aurora').followUpRound, 0);
  assert.equal(getActor(battle, 'aurora').mp, 95);
  assert.equal(battle.actionCount, 1);
  battle.cursor = battle.queue.indexOf('aurora');
  assert.throws(() => executeAction(battle, { actorId: 'aurora', abilityId: 'aurora.follow_up', targetId: 'enemy_2' }), /chưa có kỹ năng/);
  use(battle, 'iris', '$attack', 'enemy_2');
  assert.equal(charges(battle), 1);
  assert.equal(followups(battle).length, 1); // The ally's attack still triggers the unused follow-up.
});

test('Aurora cannot generate follow-ups or charges from her magical basic attack, including when alone', () => {
  for (const party of [['aurora'], ['aurora', 'iris']]) {
    const battle = setup(party);
    use(battle, 'aurora', '$attack', 'enemy_2');
    assert.equal(charges(battle), 0);
    assert.equal(followups(battle).length, 1);
    assert.equal(getActor(battle, 'aurora').followUpRound, 0);
  }
});

test('the global rule applies to a future data-defined character and follow-ups never chain', () => {
  const custom = structuredClone(content);
  custom.characters.future_mage = { ...structuredClone(custom.characters.aurora), id: 'future_mage', name: 'Future Mage' };
  const battle = setup(['aurora', 'future_mage', 'iris', 'elaine'], custom);
  use(battle, 'aurora', 'aurora.spark', 'enemy_2');
  assert.equal(charges(battle), 0);
  assert.equal(getActor(battle, 'future_mage').resourceValues.thunder_charge, 1);
  assert.deepEqual(battle.events.filter(event => event.type === 'damage').map(event => event.sourceId), ['aurora', 'future_mage']);
  use(battle, 'future_mage', 'aurora.spark', 'enemy_2');
  assert.equal(charges(battle), 1);
  assert.equal(getActor(battle, 'future_mage').resourceValues.thunder_charge, 1);
  assert.deepEqual(battle.events.filter(event => event.type === 'damage').map(event => event.sourceId), ['future_mage', 'aurora']);
});

test('two rounds grant two charges; restoration waits for Aurora’s turn, clamps MP, and preserves the round quota', () => {
  const battle = setup(['iris', 'aurora', 'arthur', 'elaine']);
  const iris = getActor(battle, 'iris'), aurora = getActor(battle, 'aurora');
  const arthur = getActor(battle, 'arthur'), elaine = getActor(battle, 'elaine');
  iris.mp = 1; aurora.mp = 0; arthur.mp = 39;
  use(battle, 'iris', '$attack', 'enemy_2');
  use(battle, 'elaine', '$defend');
  assert.equal(activeActor(battle).id, 'aurora');
  assert.equal(charges(battle), 1);
  assert.equal(aurora.mp, 0); // One charge never restores MP.
  use(battle, 'aurora', '$defend');
  use(battle, 'arthur', '$defend');
  for (const id of ['enemy_0', 'enemy_1', 'enemy_2']) use(battle, id, '$defend');
  assert.equal(battle.round, 2);
  use(battle, 'iris', '$attack', 'enemy_2');
  assert.equal(charges(battle), 2);
  assert.equal(aurora.mp, 0);
  use(battle, 'elaine', '$defend');
  assert.equal(activeActor(battle).id, 'aurora');
  assert.equal(charges(battle), 0);
  assert.deepEqual([iris.mp, aurora.mp, arthur.mp, elaine.mp], [19, 20, 40, 100]);
  assert.deepEqual(battle.events.filter(event => event.type === 'mp_restore').map(event => [event.targetId, event.amount]), [['iris', 18], ['aurora', 20], ['arthur', 1]]);
  use(battle, 'aurora', 'aurora.spark', 'enemy_2');
  assert.equal(charges(battle), 0); // Already triggered this round, even though charges were consumed.
  assert.equal(followups(battle).length, 1); // Only the active spell.
});

test('all accumulated charges are consumed even when the whole party already has full MP', () => {
  const battle = setup();
  const aurora = getActor(battle, 'aurora');
  aurora.resources.thunder_charge.max = 4;
  aurora.resourceValues.thunder_charge = 3; // Future resource-cap upgrades must still consume everything.
  use(battle, 'iris', '$defend');
  use(battle, 'elaine', '$defend');
  assert.equal(charges(battle), 0);
  assert.ok(battle.log.some(line => line.includes('tiêu 3 Lôi ấn')));
  assert.equal(battle.events.filter(event => event.type === 'mp_restore').length, 0);
});

test('physical, enemy spells and area magic do not trigger, even if only one enemy remains', () => {
  const battle = setup(['arthur', 'aurora', 'fiona', 'elaine']);
  use(battle, 'arthur', '$attack', 'enemy_2');
  use(battle, 'fiona', 'fiona.refraction');
  assert.equal(charges(battle), 0);
  getActor(battle, 'enemy_0').hp = 0;
  getActor(battle, 'enemy_1').hp = 0;
  use(battle, 'fiona', 'fiona.refraction');
  assert.equal(charges(battle), 0);
  const enemy = getActor(battle, 'enemy_2');
  enemy.abilities.push('aurora.spark');
  use(battle, enemy.id, 'aurora.spark', 'aurora');
  assert.equal(charges(battle), 0);
});

test('a shielded enemy triggers the passive, a defeated enemy does not, and a follow-up kill still grants a charge', () => {
  const shielded = setup();
  getActor(shielded, 'enemy_2').shield = 100;
  const before = getActor(shielded, 'enemy_2').hp;
  use(shielded, 'iris', '$attack', 'enemy_2');
  assert.equal(getActor(shielded, 'enemy_2').hp, before);
  assert.equal(charges(shielded), 1);

  const defeated = setup();
  getActor(defeated, 'enemy_2').hp = 1;
  use(defeated, 'iris', '$attack', 'enemy_2');
  assert.equal(charges(defeated), 0);
  getActor(defeated, 'enemy_0').hp = 40;
  use(defeated, 'iris', '$attack', 'enemy_0');
  assert.equal(getActor(defeated, 'enemy_0').hp, 0);
  assert.equal(charges(defeated), 1);
});

test('multi-hit single-target magic grants only one follow-up in the round', () => {
  const custom = structuredClone(content);
  custom.abilities['fiona.shard'].effects[0].hits = 3;
  const battle = setup(undefined, custom);
  use(battle, 'fiona', 'fiona.shard', 'enemy_2');
  assert.equal(charges(battle), 1);
  assert.equal(followups(battle).length, 1);
  assert.equal(battle.events.filter(event => event.type === 'damage').length, 4);
});

test('defeated Aurora cannot follow up, and MP restoration never revives or restores defeated allies', () => {
  const absent = setup();
  getActor(absent, 'aurora').hp = 0;
  use(absent, 'iris', '$attack', 'enemy_2');
  assert.equal(charges(absent), 0);
  const battle = setup();
  getActor(battle, 'fiona').hp = 0;
  for (const actor of battle.actors.filter(actor => actor.team === 'party')) actor.mp = 0;
  getActor(battle, 'aurora').resourceValues.thunder_charge = 2;
  use(battle, 'iris', '$defend');
  use(battle, 'elaine', '$defend');
  assert.equal(getActor(battle, 'fiona').mp, 0);
  assert.equal(getActor(battle, 'fiona').hp, 0);
  assert.equal(getActor(battle, 'aurora').mp, 20);
});

test('older saves gain Aurora without changing the party or storing battle charges', () => {
  const campaign = createCampaign(content);
  delete campaign.characters.aurora;
  const restored = deserializeCampaign(serializeCampaign(campaign), content);
  assert.deepEqual(restored.party, campaign.party);
  assert.deepEqual(restored.characters.aurora, { level: 1, upgradeIds: [] });
  assert.equal('resourceValues' in restored.characters.aurora, false);
});

test('validation catches broken follow-up references, thresholds, MP ratios and active registration', () => {
  const broken = structuredClone(content);
  broken.characters.aurora.passive.threshold = 3;
  broken.characters.aurora.passive.mpRestoreRatio = 2;
  broken.characters.aurora.abilities.push('aurora.follow_up');
  broken.abilities['aurora.follow_up'].target = 'all_enemies';
  const errors = validateContent(broken).join('\n');
  assert.match(errors, /resource threshold/);
  assert.match(errors, /MP restore ratio/);
  assert.match(errors, /cannot be an active command/);
  assert.match(errors, /single-target magical/);
  broken.characters.aurora.passive.followUpAbility = 'missing';
  assert.match(validateContent(broken).join('\n'), /unknown abilities/);
});
