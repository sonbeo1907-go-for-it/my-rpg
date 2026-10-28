import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/load-content.mjs';
import { ELEMENTS, validateContent } from '../src/core/content.js';
import { createCampaign } from '../src/core/progression.js';
import { createBattle, executeAction, getActor } from '../src/core/battle.js';

const content = await loadContent();

function strike(enemyId, element, damageType, shield = 0) {
  const campaign = createCampaign(content);
  campaign.party = ['arthur'];
  const battle = createBattle(content, campaign, enemyId === 'ogre_underling' ? 'ogre_trial' : 'forest_patrol');
  const actor = getActor(battle, 'arthur');
  const target = battle.actors.find(member => member.definitionId === enemyId);
  actor.element = element;
  actor.basicDamageType = damageType;
  actor.stats.attack = 40;
  actor.stats.magic = 40;
  target.stats.defense = 0;
  target.stats.resistance = 0;
  target.shield = shield;
  executeAction(battle, { actorId: actor.id, abilityId: '$attack', targetId: target.id });
  return { battle, target, event: battle.events.find(event => event.type === 'damage') };
}

test('enemy innate weaknesses match the requested roster and replace old affinities', () => {
  assert.deepEqual(content.enemies.goblin.weaknesses, ELEMENTS);
  assert.deepEqual(content.enemies.elder_frog.weaknesses, ['fire']);
  assert.deepEqual(content.enemies.ogre_underling.weaknesses, ['light', 'dark']);
  assert.equal(content.enemies.elder_frog.resistances?.fire ?? 1, 1);
  assert.equal(content.enemies.elder_frog.resistances?.thunder ?? 1, 1);
  assert.equal(content.enemies.ogre_underling.resistances?.wind ?? 1, 1);
});

test('Goblin receives exactly 150% damage from all eight elements, physical and magical', () => {
  for (const element of ELEMENTS) {
    for (const damageType of ['physical', 'magical']) {
      const { event } = strike('goblin', element, damageType);
      assert.equal(event.amount, 60, `${element}/${damageType}`);
      assert.equal(event.weakness, true);
      assert.equal(event.element, element);
    }
  }
});

test('Ogre and Elder Frog only amplify matching elements, including magical and physical attacks', () => {
  for (const [id, weaknesses] of [['ogre_underling', ['light', 'dark']], ['elder_frog', ['fire']]]) {
    for (const element of ELEMENTS) {
      for (const damageType of ['physical', 'magical']) {
        const { event } = strike(id, element, damageType);
        assert.equal(event.amount, weaknesses.includes(element) ? 60 : 40, `${id}/${element}/${damageType}`);
        assert.equal(event.weakness, weaknesses.includes(element));
      }
    }
  }
});

test('weakness is applied before shield absorption and appears in the combat log', () => {
  const { event, target, battle } = strike('goblin', 'light', 'physical', 25);
  assert.equal(event.absorbed, 25);
  assert.equal(event.amount, 35);
  assert.equal(target.shield, 0);
  assert.equal(target.hp, target.stats.maxHp - 35);
  assert.ok(battle.log.some(line => line.includes('yếu LIGHT (+50%)')));
});

test('AoE and counterattacks use each actual target’s innate weakness', () => {
  const campaign = createCampaign(content);
  campaign.party = ['fiona'];
  const area = createBattle(content, campaign, 'forest_patrol');
  executeAction(area, { actorId: 'fiona', abilityId: 'fiona.refraction' });
  const impacts = area.events.filter(event => event.type === 'damage');
  assert.deepEqual(impacts.map(event => [event.targetId, event.amount, event.weakness]), [
    ['enemy_0', 24, true], ['enemy_1', 24, true], ['enemy_2', 11, false]
  ]);

  campaign.party = ['takeshi'];
  const counter = createBattle(content, campaign, 'forest_patrol', () => 0);
  executeAction(counter, { actorId: 'takeshi', abilityId: 'takeshi.stance' });
  executeAction(counter, { actorId: 'enemy_0', abilityId: 'enemy.slash', targetId: 'takeshi' });
  const retaliation = counter.events.find(event => event.type === 'damage');
  assert.equal(retaliation.targetId, 'enemy_0');
  assert.equal(retaliation.amount, 32);
  assert.equal(retaliation.weakness, true);
});

test('weakness validation rejects invalid shapes, unknown elements and duplicate entries', () => {
  for (const [weaknesses, message] of [['fire', /must be an array/], [['ice'], /invalid weakness/], [['light', 'light'], /duplicate weakness/]]) {
    const broken = structuredClone(content);
    broken.enemies.goblin.weaknesses = weaknesses;
    assert.match(validateContent(broken).join('\n'), message);
  }
});
