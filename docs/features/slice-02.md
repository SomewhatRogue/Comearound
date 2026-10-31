# Slice 2: Come Bye! herding, end to end

## Acceptance criteria (EARS)

- While in the lobby, a player shall be able to pick name, breed, coat, eyes and collar, and every player shall see their dog change.
- While in the lobby, the meadow flock shall be out so players can practise; barks there shall not count.
- When the host starts Co-op Trials with bots on, the server shall fill to at least 3 dogs and run three fields in order.
- When the host starts Versus, the server shall make two even teams (bots filling to at least 4 dogs) and run three fields.
- While a dog walks or sprints near sheep, the sheep shall move away; a dog lying down shall move them far less.
- When a dog barks, sheep within earshot shall run away faster than they would from a quiet dog, and the dog shall not bark again for 1.6 s.
- If a dog barks near the goat often enough, then the goat shall walk to that dog, freeze it for 4 s and send that dog (only) the NAUGHTY close-up.
- The server shall never let a sheep through a pen fence, nor a dog into a pen.
- When every sheep a team must pen is inside and held 2.5 s, the server shall record that team as finished with its time left.
- When a field ends, every client shall see a score card: sheep, time bonus, calm herding, goat bonus.
- When a Co-op run ends, the server shall add it to the room leaderboard (top 10) and the client shall keep the browser's best.
- If a player reloads or reconnects with the same token, then the server shall return their seat and team.
- When a new player joins mid-run, the server shall make them a spectator until the next run.
- While on a touch device, the client shall show a thumbstick and BARK, DOWN and SPRINT buttons, and ask for landscape in portrait.

## Verified by

- `tests/herding.test.ts` (12 tests), `scripts/bench.ts` (bots clear all fields on most seeds),
  `npm run probe` (laptop, friend, phone, late joiner, reload, full run).

## Feel check (Kyle)

- Is the eye cone and lying down readable? Do you find the crouch-and-stare rhythm?
- Is bark too strong, too weak? Does the goat come over too often or not enough?
- Is the camera too high to see your dog, or too low to see the flock?
- On a phone: is the stick comfortable, and can you hit BARK without looking?
