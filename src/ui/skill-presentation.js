import { damageMultiplier, supportAmount, effectiveStat, EMERGENCY_HEAL_MULTIPLIER, EMERGENCY_HP_THRESHOLD } from '../core/combat-math.js';

// Shared presentation for preparation previews and combat commands.
// Numeric previews use the same multiplier / support rounding as the battle engine.
export function skillDescription(skill) {
  if (skill.description) return skill.description;
  return skill.id === '$defend'
    ? 'Giảm 40% sát thương đến hết lượt kế tiếp.'
    : 'Đòn cơ bản, không tốn tài nguyên.';
}

export function skillCost(skill, actor) {
  const costs = [];
  if (skill.cost?.mp) costs.push(`${skill.cost.mp} MP`);
  if (skill.cost?.resource) {
    const cost = skill.cost.resource;
    const name = actor.resources[cost.id].name;
    costs.push(cost.all ? `Toàn bộ ${name} (ít nhất ${cost.min})` : `${cost.amount} ${name}`);
  }
  if (skill.cooldown) costs.push(`Hồi ${skill.cooldown} vòng`);
  return costs.join(' · ') || 'Không tốn MP';
}

export const TARGET_NAMES = {
  enemy: 'Một kẻ địch', all_enemies: 'Mọi kẻ địch',
  ally: 'Một đồng đội', all_allies: 'Toàn đội', self: 'Bản thân'
};

export function passiveDescription(actor, content) {
  const passive = actor.passive;
  if (!passive) return null;
  if (passive.type === 'stat_boost') {
    const names = { attack: 'ATK', magic: 'MAG', defense: 'DEF', resistance: 'RES', speed: 'SPD' };
    return `${passive.name}: ${Object.entries(passive.modifiers).map(([key, amount]) => `${amount >= 0 ? '+' : '−'}${percent(Math.abs(amount))} ${names[key]} vĩnh viễn (${number(actor.baseStats?.[key] ?? actor.stats[key])} cơ bản → ${number(effectiveStat(actor, key))})`).join('; ')}. Buff trong trận cộng tỷ lệ trên chỉ số cơ bản.`;
  }
  if (passive.type === 'damage_reduction') return `Luôn giảm ${Math.round(passive.amount * 100)}% sát thương nhận.`;
  if (passive.type === 'shield_break_heal') return `Khi khiên do ${actor.name} tạo bị phá, hồi tối đa ${Math.round(actor.stats.magic * passive.multiplier)} HP cho người mang khiên nếu cả hai còn đứng vững.`;
  if (passive.type === 'dodge_counter') return `Né thành công sẽ phản công và tạo 1 ${actor.resources[passive.resource].name}, tối đa một lần mỗi vòng.`;
  if (passive.type === 'magic_followup_mp') {
    const effect = content?.abilities[passive.followUpAbility]?.effects[0];
    const attack = effect ? `${percent(effect.multiplier ?? 1)} MAG hệ ${effect.element.toUpperCase()}` : 'một đòn phép';
    return `${passive.name}: mỗi vòng một lần, khi đồng đội khác gây sát thương phép đơn mục tiêu lên kẻ địch còn sống, đánh bồi ${attack} và tích 1 ${actor.resources[passive.resource].name}. Đòn của bản thân không kích hoạt đánh bồi. Đầu lượt nếu có ít nhất ${passive.threshold} ${actor.resources[passive.resource].name}, tiêu hết để hồi ${percent(passive.mpRestoreRatio)} MP tối đa cho mỗi đồng đội còn sống, gồm bản thân. Đánh bồi không kích hoạt đánh bồi khác.`;
  }
  return null;
}

const number = value => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
const percent = value => `${number(value * 100)}%`;

export function skillPreviewOptions(skill, actor, content) {
  const controls = [];
  if (skill.effects.some(effect => effect.perResource) && skill.cost?.resource?.all) {
    const resource = skill.cost.resource;
    controls.push({ key: 'spent', label: `${actor.resources[resource.id].name} giả định`, min: resource.min ?? 1, max: actor.resources[resource.id].max });
  }
  const mark = skill.effects.find(effect => effect.consumeStatus && effect.perStack);
  if (mark) controls.push({ key: 'stacks', label: `${content.statuses[mark.consumeStatus].name} trên mỗi mục tiêu`, min: 0, max: content.statuses[mark.consumeStatus].maxStacks ?? 1 });
  if (skill.effects.some(effect => effect.lowHpBonus)) controls.push({ key: 'hpPercent', label: 'HP người dùng (%)', min: 1, max: 100 });
  return controls;
}

export function skillScaling(skill, actor, content, choices = {}) {
  const lines = [];
  const cost = skill.cost?.resource;
  const resourceName = cost ? actor.resources[cost.id].name : '';
  const spent = choices.spent ?? (cost?.all ? actor.resources[cost.id].max : cost?.amount ?? 0);
  const perPerson = skill.target === 'all_allies' ? '/người' : '';
  for (const effect of skill.effects) {
    if (effect.type === 'damage') {
      const stat = effect.damageType === 'physical' ? 'ATK' : 'MAG';
      let formula = `${percent(effect.multiplier ?? 1)} ${stat}`;
      if (effect.perResource) formula += ` + ${percent(effect.perResource)} ${stat} mỗi ${resourceName} đã tiêu`;
      if (effect.perStack) formula += ` + ${percent(effect.perStack)} ${stat} mỗi ${content.statuses[effect.consumeStatus].name}`;
      if (effect.lowHpBonus) formula += ` + tối đa ${percent(effect.lowHpBonus)} ${stat} theo tỷ lệ HP đã mất`;
      const hitPrefix = effect.hits > 1 ? `${effect.hits} hit × (` : '';
      lines.push(`Hệ số: ${hitPrefix}${formula}${hitPrefix ? ')' : ''}.`);
      if (effect.perResource || effect.perStack || effect.lowHpBonus) {
        const stacks = choices.stacks ?? (content.statuses[effect.consumeStatus]?.maxStacks ?? 0);
        const multiplier = damageMultiplier(effect, { spent, stacks, hpRatio: (choices.hpPercent ?? 100) / 100 });
        lines.push(`Hệ số theo giả định: ${effect.hits > 1 ? `${effect.hits} hit × ` : ''}${percent(multiplier)} ${stat}.`);
      }
      if (effect.penetration) lines.push(`Xuyên ${percent(effect.penetration)} ${effect.damageType === 'physical' ? 'DEF' : 'RES'} của mục tiêu.`);
      if (effect.unavoidable) lines.push('Đòn đánh không thể né.');
    }
    if (effect.type === 'heal' || effect.type === 'shield') {
      const formula = [effect.multiplier ? `${percent(effect.multiplier)} MAG` : '', effect.flat ? number(effect.flat) : ''].filter(Boolean).join(' + ') || '0';
      const amount = supportAmount(effect, actor.stats.magic);
      lines.push(`${effect.type === 'shield' ? 'Khiên' : 'Hồi phục'}: ${formula} → ${number(amount)} ${effect.type === 'shield' ? 'khiên' : 'HP'}${perPerson}.`);
      if (effect.type === 'heal' && effect.emergency) lines.push(`Khi mục tiêu còn ≤${percent(EMERGENCY_HP_THRESHOLD)} HP: lượng hồi ×${number(EMERGENCY_HEAL_MULTIPLIER)} → ${number(supportAmount(effect, actor.stats.magic, true))} HP${perPerson}.`);
    }
    if (effect.type === 'resource') lines.push(`${effect.resource === 'mp' ? 'Hồi' : 'Tạo'} ${effect.amount} ${effect.resource === 'mp' ? 'MP' : actor.resources[effect.resource]?.name ?? effect.resource}${effect.to === 'self' || skill.target === 'self' ? ' cho bản thân' : ''}.`);
    if (effect.type === 'cleanse') lines.push('Giải toàn bộ hiệu ứng bất lợi trên người nhận.');
    if (effect.type === 'status') {
      const status = content.statuses[effect.status];
      const duration = `${effect.duration} lượt của người nhận`;
      const labels = { attack: 'ATK', magic: 'MAG', defense: 'DEF', resistance: 'RES (kháng phép)', speed: 'SPD', damageBonus: 'sát thương gây ra', evasion: 'khả năng né đòn vật lí' };
      for (const [key, value] of Object.entries(status.modifiers ?? {})) {
        lines.push(key === 'damageReduction' ? `Giảm ${percent(value)} sát thương nhận · ${duration}.` : `${value >= 0 ? '+' : '−'}${percent(Math.abs(value))} ${labels[key] ?? key} · ${duration}.`);
      }
      if (status.regen) lines.push(`Hồi ${percent(status.regen)} HP tối đa của người nhận vào đầu lượt · ${duration}.`);
      if (status.cover) lines.push(`Nhận đòn đơn mục tiêu thay người nhận · ${duration}.`);
      if (status.taunt) lines.push(`Thu hút các đòn đơn mục tiêu · ${duration}.`);
      if (status.blockResourceGain) lines.push(`Chặn tích tài nguyên · ${duration}.`);
      if (status.onDamagedResource) lines.push(`Mỗi hit chịu đựng tạo 1 ${actor.resources[status.onDamagedResource]?.name ?? status.onDamagedResource} · ${duration}.`);
      if (status.maxStacks) lines.push(`Đặt ${status.name}, tối đa ${status.maxStacks} tầng · ${duration}.`);
      if (status.consumeOnAttack) lines.push('Tiêu hiệu ứng sau hành động tấn công tiếp theo.');
    }
  }
  return lines;
}
