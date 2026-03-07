# Slay the Spire 2 — SpireBridge Skill

Play Slay the Spire 2 via the SpireBridge CLI. Requires STS2 running with the SpireBridge mod.

## CLI: `spire-cli`

### Get current game state
```bash
spire-cli state
```

### Combat
```bash
spire-cli play "Card Name" --target "Enemy Name"  # play a card (target optional)
spire-cli end-turn                                  # end turn
spire-cli potion "Potion Name" --target "Enemy"     # use potion (target optional)
```

### Navigation
```bash
spire-cli map "Monster"    # choose map node (Monster/Elite/RestSite/Shop/Event/Treasure)
spire-cli proceed          # advance past rewards, shop, game over
```

### Rewards
```bash
spire-cli reward 0              # pick reward by index
spire-cli card-reward "Bash"    # pick card reward by name
spire-cli card-reward skip      # skip card reward
```

### Rest Sites
```bash
spire-cli rest heal                    # heal at rest site
spire-cli rest smith --card "Strike"   # upgrade a card
```

### Events
```bash
spire-cli event 0    # choose event option by index
```

### Run Management
```bash
spire-cli start --character Ironclad   # start new run
spire-cli abandon                       # abandon current run
```

## Gameplay Loop

1. `spire-cli state` to see what's happening
2. Make decisions based on screen type:
   - **combat**: play cards, use potions, end turn
   - **map**: choose next node
   - **rewards/card_reward**: pick rewards
   - **rest_site**: heal or upgrade
   - **event**: choose option
   - **shop**: proceed (or buy if implemented)
3. Every command returns the full updated game state — no need to call `state` between actions
4. Repeat

## Progress Updates

Send the user periodic updates via the `message` tool so they can follow along. Don't go silent for long stretches.

- **Combat start**: "Starting combat vs [enemies]. HP: X/Y"
- **Each turn**: Brief summary of cards played, damage dealt/taken, enemy HP
- **Combat end**: "Won combat vs [enemies]. HP: X/Y. Picking rewards."
- **Map decisions**: "Heading to [node type] on floor [N]"
- **Rest sites**: "Resting: [heal/upgrade]. HP: X/Y"
- **Notable events**: Card adds/removes, relic pickups, shop purchases

Keep updates concise — one or two lines per update. Don't dump raw game state.

## Card Info

Use `spire-cli card-info <name>` to look up card details (description, damage, block, cost). Useful when:
- Choosing card rewards (check what the card does)
- Deciding what to upgrade at rest sites
- Encountering unfamiliar cards

## Notes

Use `spire-cli notes` to read persistent learnings from past sessions.
Use `spire-cli note "..."` to save insights (enemy patterns, card synergies, mistakes).
Read notes at the start of each session.

## Tips
- Card and enemy names are case-insensitive and support partial matching
- In combat, manage energy carefully — cards cost energy to play
- Consider enemy intents when deciding between attack and defense
