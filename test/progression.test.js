import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/load-content.mjs';
import { assembleContent, validateContent } from '../src/core/content.js';
import { createCampaign, completeStoryEvent, resolveCharacter, serializeCampaign, deserializeCampaign } from '../src/core/progression.js';

const content = await loadContent();

test('character roster has valid content references and the required elements', () => {
  assert.ok(Object.keys(content.characters).length >= 16);
  assert.deepEqual(validateContent(content), []);
  assert.equal(content.characters.arthur.element, 'light');
  assert.equal(content.characters.iris.element, 'plain');
  assert.equal(content.characters.rhett.element, 'thunder');
  assert.equal(content.characters.aurora.element, 'thunder');
  assert.equal(content.characters.lisbeth.element, 'light');
});

test('story upgrades are gated, idempotent, and preserve base definitions', () => {
  const campaign = createCampaign(content);
  const before = JSON.stringify(content.characters.arthur);
  assert.deepEqual(completeStoryEvent(campaign, content, 'unrelated_event'), []);
  assert.equal(resolveCharacter(content, campaign, 'arthur').abilities.includes('arthur.partial_release'), false);
  assert.deepEqual(completeStoryEvent(campaign, content, 'arthur_completed_sword_training'), ['arthur.control_training']);
  assert.deepEqual(completeStoryEvent(campaign, content, 'arthur_completed_sword_training'), []);
  const arthur = resolveCharacter(content, campaign, 'arthur');
  assert.ok(arthur.abilities.includes('arthur.partial_release'));
  assert.ok(arthur.abilities.includes('arthur.ogres_bane_controlled'));
  assert.ok(!arthur.abilities.includes('arthur.ogres_bane'));
  assert.equal(JSON.stringify(content.characters.arthur), before);
});

test('save round-trip retains party and upgrades without battle state', () => {
  const campaign = createCampaign(content);
  campaign.party = ['fiona', 'takeshi', 'armie'];
  campaign.unlockedCharacterIds.push('armie');
  campaign.victories = 2;
  completeStoryEvent(campaign, content, 'arthur_completed_sword_training');
  assert.deepEqual(deserializeCampaign(serializeCampaign(campaign), content), campaign);
  assert.equal('hp' in campaign.characters.arthur, false);
});

test('save rejects unsupported versions, invalid parties and unearned upgrades', () => {
  const campaign = createCampaign(content);
  assert.throws(() => deserializeCampaign('{broken', content));
  assert.throws(() => deserializeCampaign(JSON.stringify({ ...campaign, version: 99 }), content));
  assert.throws(() => deserializeCampaign(JSON.stringify({ ...campaign, party: ['arthur', 'arthur'] }), content));
  campaign.characters.arthur.upgradeIds = ['arthur.control_training'];
  assert.throws(() => deserializeCampaign(JSON.stringify(campaign), content));
});

test('adding a new character does not break existing saves', () => {
  const old = createCampaign(content);
  delete old.characters.fran;
  const restored = deserializeCampaign(JSON.stringify(old), content);
  assert.deepEqual(restored.characters.fran, { level: 1, upgradeIds: [] });
});

test('content validation reports bad references, resource typos and damage types', () => {
  const broken = structuredClone(content);
  broken.characters.arthur.abilities.push('missing');
  broken.abilities['arthur.release'].cost.resource.id = 'typo';
  broken.abilities['rhett.shot'].effects[0].damageType = 'thunder';
  const errors = validateContent(broken).join('\n');
  assert.match(errors, /unknown abilities/);
  assert.match(errors, /unknown resource typo/);
  assert.match(errors, /invalid damage type/);
});

test('duplicate content ids fail loudly rather than silently overwriting data', () => {
  assert.throws(() => assembleContent({ characters: [{ id: 'arthur' }, { id: 'arthur' }] }), /duplicate/);
});
