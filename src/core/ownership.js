export function ownsCharacter(campaign, id) {
  return campaign.unlockedCharacterIds?.includes(id) === true;
}

export function assertOwnedParty(campaign) {
  if (campaign.party.some(id => id !== null && !ownsCharacter(campaign, id))) throw new Error('Đội hình chứa nhân vật chưa mở khóa.');
}

export function unlockCharacter(campaign, content, id) {
  if (!Object.hasOwn(content.characters, id)) throw new Error('Nhân vật không hợp lệ.');
  if (ownsCharacter(campaign, id)) return false;
  campaign.unlockedCharacterIds.push(id);
  return true;
}
