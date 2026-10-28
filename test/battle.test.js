import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/load-content.mjs';
import { createCampaign, completeStoryEvent } from '../src/core/progression.js';
import { createBattle, getActor, activeActor, executeAction, executeEnemyTurn, abilityAvailability, targetsFor } from '../src/core/battle.js';
import { seededRandom } from '../src/core/random.js';

const content = await loadContent();
function setup(party, random = () => 0.99) {
  const campaign = createCampaign(content);
  campaign.party = party;
  campaign.unlockedCharacterIds = Object.keys(content.characters);
  return createBattle(content, campaign, 'forest_patrol', random);
}
// Unit tests position the turn cursor directly to isolate individual rules.
function turn(battle, id) { battle.cursor = battle.queue.indexOf(id); assert.ok(battle.cursor >= 0); }
function use(battle, actorId, abilityId, targetId = actorId) {
  turn(battle, actorId);
  executeAction(battle, { actorId, abilityId, targetId });
}

test('an invalid action does not spend MP, resources, cooldowns or a turn', () => {
  const battle = setup(['arthur']);
  turn(battle, 'arthur');
  const arthur = getActor(battle, 'arthur');
  arthur.resourceValues.resonance = 3;
  const before = JSON.stringify({ actor: arthur, cursor: battle.cursor, actions: battle.actionCount });
  assert.throws(() => executeAction(battle, { actorId: 'arthur', abilityId: 'arthur.ogres_bane', targetId: 'arthur' }), /Mục tiêu/);
  assert.equal(JSON.stringify({ actor: arthur, cursor: battle.cursor, actions: battle.actionCount }), before);
  assert.throws(() => executeAction(battle, { actorId: 'arthur', abilityId: 'fiona.shard', targetId: 'enemy_0' }), /chưa có/);
});

test('Arthur resource caps, costs and exhaustion work independently of story state', () => {
  const battle = setup(['arthur', 'garrek']);
  const arthur = getActor(battle, 'arthur');
  arthur.resourceValues.resonance = 3;
  use(battle, 'arthur', 'arthur.light_slash', 'enemy_2');
  assert.equal(arthur.resourceValues.resonance, 3);
  use(battle, 'arthur', 'arthur.ogres_bane', 'enemy_2');
  assert.equal(arthur.resourceValues.resonance, 0);
  assert.ok(arthur.statuses.some(status => status.id === 'exhausted'));
  use(battle, 'arthur', 'arthur.light_slash', 'enemy_0');
  assert.equal(arthur.resourceValues.resonance, 0);
  assert.ok(!arthur.statuses.some(status => status.id === 'exhausted'));
});

test('Garrek intercepts single-target damage but not area damage', () => {
  const battle = setup(['arthur', 'garrek']);
  const arthur = getActor(battle, 'arthur'), garrek = getActor(battle, 'garrek');
  use(battle, 'garrek', 'garrek.cover', 'arthur');
  use(battle, 'enemy_0', 'enemy.slash', 'arthur');
  assert.equal(arthur.hp, arthur.stats.maxHp);
  assert.ok(garrek.hp < garrek.stats.maxHp);
  use(battle, 'enemy_2', 'enemy.splash', 'arthur');
  assert.ok(arthur.hp < arthur.stats.maxHp);
});

test('a dead cover source cannot intercept damage', () => {
  const battle = setup(['arthur', 'garrek']);
  use(battle, 'garrek', 'garrek.cover', 'arthur');
  getActor(battle, 'garrek').hp = 0;
  use(battle, 'enemy_0', 'enemy.slash', 'arthur');
  assert.ok(getActor(battle, 'arthur').hp < getActor(battle, 'arthur').stats.maxHp);
});

test('Takeshi dodges physical hits and counters at most once per round', () => {
  const battle = setup(['takeshi'], () => 0);
  const takeshi = getActor(battle, 'takeshi');
  use(battle, 'takeshi', 'takeshi.stance');
  use(battle, 'enemy_0', 'enemy.slash', 'takeshi');
  use(battle, 'enemy_1', 'enemy.slash', 'takeshi');
  assert.equal(takeshi.hp, takeshi.stats.maxHp);
  assert.equal(takeshi.resourceValues.opening, 1);
  use(battle, 'enemy_2', 'enemy.splash', 'takeshi');
  assert.ok(takeshi.hp < takeshi.stats.maxHp);
});

test('shields do not stack and heal once when Elaine’s shield breaks', () => {
  const battle = setup(['elaine', 'arthur']);
  const arthur = getActor(battle, 'arthur');
  arthur.hp -= 50;
  use(battle, 'elaine', 'elaine.shield', 'arthur');
  const shield = arthur.shield;
  use(battle, 'elaine', 'elaine.shield', 'arthur');
  assert.equal(arthur.shield, shield);
  arthur.shield = 1;
  const before = arthur.hp;
  use(battle, 'enemy_0', 'enemy.slash', 'arthur');
  assert.equal(arthur.shield, 0);
  assert.ok(battle.log.some(line => line.includes('Dư âm thủy hộ')));
  assert.ok(arthur.hp > before - 20);
});

test('Iris next-attack buff survives support actions and is consumed by attacks', () => {
  const battle = setup(['iris', 'elaine']);
  use(battle, 'iris', 'iris.formula', 'elaine');
  use(battle, 'elaine', 'elaine.shield', 'elaine');
  assert.ok(getActor(battle, 'elaine').statuses.some(status => status.id === 'empowered'));
  use(battle, 'elaine', '$attack', 'enemy_0');
  assert.ok(!getActor(battle, 'elaine').statuses.some(status => status.id === 'empowered'));
});

test('Prisma stacks independently on targets and is consumed by collapse', () => {
  const battle = setup(['fiona', 'garrek']);
  use(battle, 'fiona', 'fiona.shard', 'enemy_2');
  use(battle, 'fiona', 'fiona.shard', 'enemy_2');
  assert.equal(getActor(battle, 'enemy_2').statuses.find(status => status.id === 'prisma').stacks, 2);
  assert.equal(getActor(battle, 'enemy_0').statuses.length, 0);
  use(battle, 'fiona', 'fiona.collapse', 'enemy_2');
  assert.ok(!getActor(battle, 'enemy_2').statuses.some(status => status.id === 'prisma'));
});

test('physical Thunder uses DEF, not magical resistance', () => {
  const baseline = setup(['rhett']);
  const armored = setup(['rhett']);
  for (const battle of [baseline, armored]) getActor(battle, 'rhett').resourceValues.charge = 1;
  getActor(armored, 'enemy_2').stats.defense = 100;
  const before = getActor(baseline, 'enemy_2').hp;
  use(baseline, 'rhett', 'rhett.shot', 'enemy_2');
  use(armored, 'rhett', 'rhett.shot', 'enemy_2');
  assert.ok(before - getActor(baseline, 'enemy_2').hp > before - getActor(armored, 'enemy_2').hp);
});

test('cooldowns, regeneration and cleanse use authored rules', () => {
  const battle = setup(['arden', 'armie']);
  const armie = getActor(battle, 'armie');
  armie.hp -= 70;
  use(battle, 'arden', 'arden.garden');
  assert.equal(abilityAvailability(battle, getActor(battle, 'arden'), content.abilities['arden.garden']).ok, false);
  // Garden is applied before Armie’s next natural turn, which starts automatically.
  use(battle, 'enemy_0', 'enemy.slash', 'arden');
  turn(battle, 'armie');
  armie.statuses.push({ id: 'shaken', remaining: 2, sourceId: 'enemy_0', stacks: 1 });
  use(battle, 'armie', 'armie.treatment', 'armie');
  assert.ok(!armie.statuses.some(status => status.id === 'shaken'));
  assert.ok(armie.statuses.some(status => status.id === 'regen'));
});

test('taunt constrains enemy target selection', () => {
  const battle = setup(['galliard', 'fiona']);
  use(battle, 'galliard', 'galliard.taunt');
  assert.deepEqual(targetsFor(battle, getActor(battle, 'enemy_0'), content.abilities['enemy.slash']).map(actor => actor.id), ['galliard']);
});

test('story upgrades affect new battles, not an existing battle snapshot', () => {
  const campaign = createCampaign(content);
  const before = createBattle(content, campaign, 'forest_patrol');
  completeStoryEvent(campaign, content, 'arthur_completed_sword_training');
  const after = createBattle(content, campaign, 'forest_patrol');
  assert.ok(!getActor(before, 'arthur').abilities.includes('arthur.partial_release'));
  assert.ok(getActor(after, 'arthur').abilities.includes('arthur.partial_release'));
});

test('every character can complete a deterministic headless battle without invalid state', () => {
  for (const id of Object.keys(content.characters)) {
    const campaign = createCampaign(content);
    campaign.party = [...new Set([id, 'arthur', 'armie', 'garrek'])].slice(0, 4);
    campaign.unlockedCharacterIds = Object.keys(content.characters);
    const battle = createBattle(content, campaign, 'forest_patrol', seededRandom(42));
    while (!battle.outcome && battle.actionCount < 2000) {
      const actor = activeActor(battle);
      if (actor.team === 'enemy') { executeEnemyTurn(battle); continue; }
      const turnNumber = battle.actionCount;
      const skills = actor.abilities.map(skill => content.abilities[skill]).filter(skill => abilityAvailability(battle, actor, skill).ok);
      const skill = skills[turnNumber % skills.length];
      const abilityId = skill?.id ?? '$attack';
      const target = skill ? targetsFor(battle, actor, skill)[0] : battle.actors.find(target => target.team === 'enemy' && target.hp > 0);
      executeAction(battle, { actorId: actor.id, abilityId, targetId: target?.id });
      for (const member of battle.actors) {
        assert.ok(Number.isFinite(member.hp) && member.hp >= 0 && member.hp <= member.stats.maxHp, `${id}: HP`);
        assert.ok(Number.isFinite(member.mp) && member.mp >= 0 && member.mp <= member.stats.maxMp, `${id}: MP`);
        for (const [key, value] of Object.entries(member.resourceValues)) assert.ok(value >= 0 && value <= member.resources[key].max, `${id}: resource`);
      }
    }
    assert.ok(battle.outcome, `${id}: battle should terminate`);
  }
});

test('damage feedback points to the actual cover recipient', () => {
  const battle = setup(['arthur', 'garrek']);
  use(battle, 'garrek', 'garrek.cover', 'arthur');
  use(battle, 'enemy_0', 'enemy.slash', 'arthur');
  const impacts = battle.events.filter(event => event.type === 'damage');
  assert.equal(impacts.length, 1);
  assert.equal(impacts[0].targetId, 'garrek');
  assert.equal(impacts[0].sourceId, 'enemy_0');
  assert.equal(impacts[0].amount, getActor(battle, 'garrek').stats.maxHp - getActor(battle, 'garrek').hp);
});

test('feedback preserves hit then shield-break healing even when net HP increases', () => {
  const battle = setup(['elaine', 'arthur']);
  const arthur = getActor(battle, 'arthur');
  arthur.hp -= 50;
  use(battle, 'elaine', 'elaine.shield', 'arthur');
  arthur.shield = 19;
  const before = arthur.hp;
  use(battle, 'enemy_0', 'enemy.slash', 'arthur');
  assert.ok(arthur.hp > before);
  assert.deepEqual(battle.events.map(event => event.type), ['damage', 'heal']);
  assert.deepEqual(battle.events[0], { type: 'damage', targetId: 'arthur', sourceId: 'enemy_0', amount: 1, absorbed: 19, element: 'plain', weakness: false });
  assert.equal(battle.events[1].amount, 11);
});

test('shield-only impacts have damage feedback while dodges do not', () => {
  const shieldBattle = setup(['elaine', 'arthur']);
  use(shieldBattle, 'elaine', 'elaine.shield', 'arthur');
  use(shieldBattle, 'enemy_0', 'enemy.slash', 'arthur');
  assert.equal(shieldBattle.events[0].type, 'damage');
  assert.equal(shieldBattle.events[0].amount, 0);
  assert.equal(shieldBattle.events[0].absorbed, 20);

  const dodgeBattle = setup(['takeshi'], () => 0);
  use(dodgeBattle, 'takeshi', 'takeshi.stance');
  use(dodgeBattle, 'enemy_0', 'enemy.slash', 'takeshi');
  assert.equal(dodgeBattle.events[0].type, 'dodge');
  assert.ok(!dodgeBattle.events.some(event => event.type === 'damage' && event.targetId === 'takeshi'));
  assert.ok(dodgeBattle.events.some(event => event.type === 'damage' && event.targetId === 'enemy_0'));
});

test('healing feedback covers next-turn regeneration but skips full-HP heals', () => {
  const battle = setup(['arden', 'armie']);
  use(battle, 'armie', 'armie.first_aid', 'armie');
  assert.ok(!battle.events.some(event => event.type === 'heal'));
  getActor(battle, 'armie').hp -= 50;
  use(battle, 'arden', 'arden.poultice', 'armie');
  use(battle, 'enemy_2', '$defend'); // Last actor ends the round; Armie regenerates at next turn start.
  assert.deepEqual(battle.events, [{ type: 'heal', targetId: 'armie', sourceId: 'arden', amount: 18 }]);
});
