# Design: Come Bye!

You're a sheepdog. With friends (or bot dogs), herd the flock into the pen. One goat is an agent
of chaos. As built, 2026-10-30.

## Your dog

- **Moves:** walk, **sprint** (stamina), **crouch** (slow stalk, head low), **lie down** (crouch
  and hold still), **bark** (1.6 s cooldown). No lunge; a nip may come later.
- **Breeds:** Border Collie, Keeshond, Malinois, Standard Poodle (the pack's dogs), then Golden,
  Corgi, Husky, Pug. Coats, eyes (including brilliant blue) and collar colours are yours to pick.
- **Postures show on the model:** sprinting curves the spine with the head low; crouching drops
  the body and points the nose; lying down puts the paws out front; a frozen dog sits, guilty.

## Sheep

- Graze, stick together (tighter when frightened), and move away from dogs. How close you can
  get depends on posture: sprinting scatters them from far off, walking pushes, crouching lets you
  get close, lying down settles them (the green ring).
- **The eye:** crouched and facing them (the pale cone), you ease them away without panic.
- **A bark** sends everything nearby running for a moment. Fast, but costly (see below).
- A lone sheep heads back to the others. Near the gate with others already in, the rest follow.

## The goat

- Wanders and bleats now and then, scattering sheep near it. Only gives way to a dog giving it the eye.
- **Barking near it annoys it** (the meter over its head). Too much and it walks over to whoever
  barked last, stares them down (frozen 4 s) and they get the NAUGHTY close-up.
- Pen it for a bonus. In versus, walk it onto the other side and let it bleat there.

## Modes

- **Co-op Trials:** three fields (The Meadow, Old Orchard, Windy Hillside). Score per field:
  100 per sheep penned, 4 per second left (only once every sheep is in and held 2.5 s), up to 200
  for calm herding (fewer barks per sheep), 250 for the goat. Runs go on the room leaderboard;
  your browser keeps your best.
- **Versus (Field Day):** two teams, two pens, both flocks start side by side in the middle with
  the goat. Sheep wear their team's paint and only count in their own pen. A field ends when both
  teams are all in, or on time. Best total over three fields wins.

## Controls

- Keyboard: WASD/arrows, Shift sprint, Space crouch, E bark, M sound, Esc menu.
- Phone held sideways: drag on the left half to steer (push to the edge to sprint), BARK, DOWN
  (toggles crouch), SPRINT (hold). A rotate hint shows in portrait.
