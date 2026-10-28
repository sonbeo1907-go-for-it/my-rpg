import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/load-content.mjs';
import { isValidParty, assignPartySlot, removePartySlot } from '../src/core/party.js';
import { createCampaign, deserializeCampaign, serializeCampaign, completeStoryEvent, resolveCharacter } from '../src/core/progression.js';
import { createBattle, getActor, executeAction } from '../src/core/battle.js';
import { supportAmount, damageMultiplier } from '../src/core/combat-math.js';
import { skillPreviewOptions, skillScaling } from '../src/ui/skill-presentation.js';

const content = await loadContent();

test('assigning a member swaps slots without duplicates or mutating the original party', () => {
  const party = ['arthur', 'iris', 'elaine', 'garrek'];
  assert.deepEqual(assignPartySlot(party, 0, 'elaine'), ['elaine', 'iris', 'arthur', 'garrek']);
  assert.deepEqual(party, ['arthur', 'iris', 'elaine', 'garrek']);
  assert.deepEqual(assignPartySlot(party, 1, 'freya'), ['arthur', 'freya', 'elaine', 'garrek']);
});

test('empty slots stay in place when a member is removed or moved', () => {
  const party = removePartySlot(['arthur', 'iris', 'elaine', 'garrek'], 1);
  assert.deepEqual(party, ['arthur', null, 'elaine', 'garrek']);
  assert.deepEqual(assignPartySlot(party, 1, 'garrek'), ['arthur', 'garrek', 'elaine', null]);
});

test('empty parties, duplicates, invalid IDs and invalid slot indexes are rejected', () => {
  assert.throws(() => removePartySlot([null, 'arthur', null, null], 1), /ít nhất một/);
  assert.throws(() => assignPartySlot(['arthur'], 4, 'iris'), /không hợp lệ/);
  for (const party of [[null, null, null, null], ['arthur', 'arthur'], ['missing'], ['__proto__'], [undefined], []]) assert.equal(isValidParty(party, content.characters), false);
});

test('saves preserve empty positions and combat only creates occupied party actors', () => {
  const campaign = createCampaign(content);
  campaign.party = [null, 'arthur', null, 'elaine'];
  const restored = deserializeCampaign(serializeCampaign(campaign), content);
  assert.deepEqual(restored.party, campaign.party);
  const battle = createBattle(content, restored, 'forest_patrol');
  assert.deepEqual(battle.actors.filter(actor => actor.team === 'party').map(actor => actor.id), ['arthur', 'elaine']);
  assert.ok(battle.actors.every(actor => actor.stats));
});

test('older compact parties still load without losing progression', () => {
  const campaign = createCampaign(content);
  campaign.party = ['fiona', 'armie'];
  campaign.unlockedCharacterIds.push('armie');
  completeStoryEvent(campaign, content, 'arthur_completed_sword_training');
  const restored = deserializeCampaign(serializeCampaign(campaign), content);
  assert.deepEqual(restored.party, ['fiona', 'armie']);
  assert.ok(resolveCharacter(content, restored, 'arthur').abilities.includes('arthur.partial_release'));
});

test('shield preview and engine agree at 180% MAG and 110% MAG per person', () => {
  const campaign = createCampaign(content);
  campaign.party = ['elaine'];
  const actor = resolveCharacter(content, campaign, 'elaine');
  const shield = content.abilities['elaine.shield'];
  assert.match(skillScaling(shield, actor, content).join('\n'), /180% MAG → 54 khiên/);
  assert.match(skillScaling(content.abilities['elaine.sanctuary'], actor, content).join('\n'), /110% MAG → 33 khiên\/người/);
  const battle = createBattle(content, campaign, 'forest_patrol');
  executeAction(battle, { actorId: 'elaine', abilityId: shield.id, targetId: 'elaine' });
  assert.equal(getActor(battle, 'elaine').shield, supportAmount(shield.effects[0], actor.stats.magic));
});

test('emergency healing keeps combat rounding: 70 normal, 112 emergency, not 113', () => {
  const actor = content.characters.armie;
  const skill = content.abilities['armie.emergency'];
  const lines = skillScaling(skill, actor, content).join('\n');
  assert.match(lines, /220% MAG → 70 HP/);
  assert.match(lines, /≤35% HP: lượng hồi ×1,6 → 112 HP/);
  const campaign = createCampaign(content);
  campaign.party = ['armie', null, 'garrek'];
  campaign.unlockedCharacterIds.push('armie');
  const battle = createBattle(content, campaign, 'forest_patrol');
  const target = getActor(battle, 'garrek');
  target.hp = 10;
  executeAction(battle, { actorId: 'armie', abilityId: skill.id, targetId: 'garrek' });
  assert.equal(target.hp, 122);
});

test('variable previews use the selected resource count and current upgraded resource maximum', () => {
  const actor = structuredClone(content.characters.arthur);
  const skill = content.abilities['arthur.release'];
  for (const [spent, expected] of [[1, '165%'], [2, '230%'], [3, '295%']]) {
    assert.match(skillScaling(skill, actor, content, { spent }).join('\n'), new RegExp(`giả định: ${expected} ATK`));
  }
  actor.resources.resonance.max = 4;
  assert.equal(skillPreviewOptions(skill, actor, content)[0].max, 4);
  assert.equal(damageMultiplier(skill.effects[0], { spent: 4 }), 3.6);
});

test('Prisma preview accepts zero marks and scales independently of caster resources', () => {
  const actor = content.characters.fiona;
  const skill = content.abilities['fiona.collapse'];
  assert.deepEqual(skillPreviewOptions(skill, actor, content).map(item => [item.min, item.max]), [[0, 3]]);
  assert.match(skillScaling(skill, actor, content, { stacks: 0 }).join('\n'), /giả định: 25% MAG/);
  assert.match(skillScaling(skill, actor, content, { stacks: 3 }).join('\n'), /giả định: 265% MAG/);
});

test('preview distinguishes hits, target-max-HP regen, debuff values and recipient-turn durations', () => {
  assert.match(skillScaling(content.abilities['enemy.double_hit'], content.enemies.elder_frog, content).join('\n'), /2 hit × \(70% ATK\)/);
  assert.match(skillScaling(content.abilities['arden.poultice'], content.characters.arden, content).join('\n'), /12% HP tối đa của người nhận.*3 lượt của người nhận/);
  assert.match(skillScaling(content.abilities['fran.fracture'], content.characters.fran, content).join('\n'), /−35% RES.*3 lượt của người nhận/);
});
