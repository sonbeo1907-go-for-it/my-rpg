import test from 'node:test';
import assert from 'node:assert/strict';
import { loadContent } from '../scripts/load-content.mjs';
import { createCampaign, completeStoryEvent } from '../src/core/progression.js';
import { createSaveExport, parseSaveImport, MAX_SAVE_FILE_BYTES } from '../src/core/save-file.js';

const content = await loadContent();

test('JSON export/import retains full progression, ownership, currency, gear and equipment without battle/UI state', () => {
  const campaign = createCampaign(content);
  campaign.coins = 738;
  campaign.victories = 9;
  campaign.recruitmentShards = 40;
  campaign.unlockedCharacterIds.push('lisbeth');
  campaign.party = ['lisbeth', null, 'iris', 'elaine'];
  campaign.gacha.totalPulls = 5;
  campaign.gear = [{ id: 'gear_2', typeId: 't3_focused', stats: { magic: 5 } }];
  campaign.extraGearSlots = { lisbeth: 3 };
  campaign.equipment = { lisbeth: [null, null, null, null, null, 'gear_2'] };
  completeStoryEvent(campaign, content, 'arthur_completed_sword_training');
  const expected = structuredClone(campaign);
  campaign.battle = { hp: 10, cooldowns: {} };
  campaign.selectedAbility = 'lisbeth.lance';
  const before = JSON.stringify(campaign);
  const exported = createSaveExport(campaign, content, new Date('2026-10-28T12:34:56.000Z'));
  assert.equal(exported.filename, 'northern-prisma-save-v3-2026-10-28T12-34-56-000Z.json');
  assert.ok(exported.text.includes('\n  "version": 3'));
  assert.deepEqual(parseSaveImport(exported.text, content), expected);
  assert.equal('battle' in JSON.parse(exported.text), false);
  assert.equal('selectedAbility' in JSON.parse(exported.text), false);
  assert.equal(JSON.stringify(campaign), before);
  assert.deepEqual(parseSaveImport('\uFEFF' + exported.text, content), expected);
});

test('file import migrates v1 and supports earlier v2 saves without equipment', () => {
  const old = createCampaign(content);
  old.version = 1;
  old.party = ['lisbeth'];
  old.victories = 3;
  const migrated = parseSaveImport(JSON.stringify(old), content);
  assert.equal(migrated.version, 3);
  assert.equal(migrated.coins, 300);
  assert.equal(migrated.unlockedCharacterIds.length, 6);
  assert.deepEqual(migrated.party, createCampaign(content).party);
  const oldV2 = createCampaign(content); oldV2.version = 2;
  delete oldV2.equipment;
  assert.deepEqual(parseSaveImport(JSON.stringify(oldV2), content).equipment, {});
});

test('file import rejects malformed JSON, unsupported versions and invalid progression/references', () => {
  for (const text of ['', 'invalid', 'null', '[]', '{}', '{"version":99}']) assert.throws(() => parseSaveImport(text, content));
  for (const corrupt of [
    value => { value.coins = -10; },
    value => { value.characters = []; },
    value => { value.characters.arthur = null; },
    value => { value.characters.arthur = []; },
    value => { value.party = ['lisbeth']; },
    value => { value.equipment = { arthur: 'gear_1' }; },
    value => { value.characters.arthur.upgradeIds = ['missing']; }
  ]) {
    const campaign = createCampaign(content);
    corrupt(campaign);
    assert.throws(() => parseSaveImport(JSON.stringify(campaign), content));
    assert.throws(() => createSaveExport(campaign, content));
  }
});

test('file size uses UTF-8 byte length rather than character count', () => {
  const oversized = 'ắ'.repeat(Math.floor(MAX_SAVE_FILE_BYTES / 3) + 1);
  assert.ok(oversized.length < MAX_SAVE_FILE_BYTES);
  assert.throws(() => parseSaveImport(oversized, content), /10 MB/);
  assert.throws(() => parseSaveImport(undefined, content), /không hợp lệ/);
});
