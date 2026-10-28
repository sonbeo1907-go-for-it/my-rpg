// Global follow-up rule for every character: only another ally's attack may trigger it.
// Keep this rule in the engine, never as a character-data toggle.
export function canTriggerFollowUp(owner, source, target) {
  return owner.hp > 0 && target.hp > 0
    && owner.id !== source.id
    && owner.team === source.team
    && owner.team !== target.team;
}
