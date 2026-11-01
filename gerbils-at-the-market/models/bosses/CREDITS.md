# Boss body and animations: credits

Everything in this folder is CC0 (Creative Commons Zero 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/).

## suit-body.glb

Built with the repo's own merge step (a Python script that copies chosen animation clips into the body file; no
geometry or animation data was altered) from two files inside **KayKit Character Animations 1.1 (Free)**:

- `Mannequin Character/characters/Mannequin_Medium.glb`: the rigged body (Rig_Medium, 21 joints, 6,916 triangles,
  six meshes: body, two arms, two legs, head). The game hides the mannequin's head and parents its own procedural
  caricature head to the `head` bone; the mannequin's palette texture is kept in the file but replaced at runtime by a
  painted suit.
- `Animations/gltf/Rig_Medium/*.glb`: the clips `Idle_A`, `Idle_B`, `Hit_A`, `Hit_B`, `Death_A`, `Death_B` (General),
  `Walking_A`, `Running_A`, `Jump_Full_Short` (MovementBasic), `Cheering`, `Waving` (Simulation),
  `Skeletons_Taunt_Longer` (Special), `Melee_2H_Attack_Spinning` (CombatMelee).

- Author: Kay Lousberg (KayKit), https://www.kaylousberg.com
- Source: https://kaylousberg.itch.io/kaykit-character-animations (the "Free 1.1" download, 2025-10-12)
- Licence text shipped in the pack (`License.txt`): "License: (Creative Commons Zero, CC0)
  http://creativecommons.org/publicdomain/zero/1.0/ ... This content is free to use in personal, educational and
  commercial projects. ... If you wish to credit me you can do so by crediting 'Kay Lousberg, www.kaylousberg.com'
  (this is not mandatory)". Credited here with thanks.

## Considered, not shipped

- **Kenney, Animated Characters Protagonists 1.1** (https://kenney.nl/assets/animated-characters-protagonists, CC0):
  downloaded and inspected; the 1.1 zip is FBX only (characterMedium.fbx + idle/jump/run.fbx + PNG skins), not glTF,
  and its rig does not share KayKit's bone names, so it would have needed an FBX conversion and a retarget. The
  KayKit mannequin ships on the very rig the animation library targets, so it was the cleaner body.

## The heads

The caricature heads, hair, glasses and faces are the game's own procedural work (`web/js/bosses.js`,
`web/js/bosses2.js`): primitives and canvas drawings, no scanned likeness, no photographs.
