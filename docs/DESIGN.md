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
- Pen it for a bonus (it has to still be in at the end: penned goats wander back out unless a dog lies by the gate). In versus, walk it onto the other side and let it bleat there.

## Hazards, wind and weather (Tricky and Wild courses)

- **Streams**: sheep and goats only cross at bridges; dogs wade, slowly. **Mud** slows everyone.
  **Brambles** scare sheep (touch one and it bolts). A **broken fence** lets sheep out: lost, -75.
- **Wind** carries your scent: sheep downwind of you drift away. Crouch to halve it, lie down to stop it.
- **Rain** makes sheep jumpy. **Lightning** panics every sheep and makes every dog cower for a moment.
- **Goats** (some fields have three) stroll into the flock to bleat, charge through it, block
  gateways, raid pens, and come to stare down dogs that bark too much.

## Modes

- **Co-op Trials:** pick a course of three fields: Gentle (The Meadow, Old Orchard, Windy Hillside), Tricky (Brook Farm, Bramble Lane, Three Billy Goats) or Wild (Black and White sorting, Big Sky Pasture, Thunder Hill), or Challenge (exact numbers per pen: Split the Flock, Three Little Pens, Odd One Out; a gate swings shut when its pen's count is right). Each field opens with a camera tour: the pen, the sheep, your dog. You can walk into a pen in the trials (to fetch an extra out); in versus pens are shut to dogs. Score per field:
  100 per sheep penned, 4 per second left (only once every sheep is in and held 2.5 s), up to 200
  for calm herding (fewer barks per sheep), 250 for the goat. Runs go on the room leaderboard;
  your browser keeps your best.
- **Versus (Field Day):** two teams, two pens, both flocks start side by side in the middle with
  the goat. Sheep wear their team's paint and only count in their own pen. A field ends when both
  teams are all in, or on time. Best total over three fields wins.

## Playing together on the shareable page

- Everyone with the page open sees each other's games in the lobby ("Join Kyle's game"). Joining
  puts your dog in their game; they host, pick the course and start it. Bot dogs fill empty spots.
  Leave to go back to your own. Friends need to be signed in and invited to the page.

## Controls

- Keyboard: WASD/arrows, Shift sprint, Space crouch, E bark, M sound, Esc menu.
- Phone held sideways: drag on the left half to steer (push to the edge to sprint), BARK, DOWN
  (toggles crouch), SPRINT (hold). A rotate hint shows in portrait.
