import { ownsCharacter } from './ownership.js';

export function gearSlotCapacity(campaign, content, characterId) {
  const rules = content.economy.default;
  return Math.min(rules.maxGearSlots, rules.baseGearSlots + (campaign.extraGearSlots?.[characterId] ?? 0));
}

export function unlockDuplicateSlot(campaign, content, characterId) {
  if (!ownsCharacter(campaign, characterId)) throw new Error('Nhân vật chưa mở khóa.');
  const rules = content.economy.default;
  const extra = campaign.extraGearSlots?.[characterId] ?? 0;
  if (extra >= rules.maxGearSlots - rules.baseGearSlots) return false;
  campaign.extraGearSlots ??= {};
  campaign.extraGearSlots[characterId] = extra + 1;
  return true;
}

export function assertValidSlotUnlocks(campaign, content) {
  const extras = campaign.extraGearSlots;
  const rules = content.economy.default;
  if (!extras || typeof extras !== 'object' || Array.isArray(extras)) throw new Error('Dữ liệu mở ô trang bị không hợp lệ.');
  for (const [id, count] of Object.entries(extras)) {
    if (!Object.hasOwn(content.characters, id) || !ownsCharacter(campaign, id) || !Number.isSafeInteger(count)
      || count < 0 || count > rules.maxGearSlots - rules.baseGearSlots) throw new Error('Số ô trang bị đã mở không hợp lệ.');
  }
}
