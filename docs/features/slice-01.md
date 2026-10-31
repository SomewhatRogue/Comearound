# Slice 1: one full round, end to end

## Acceptance criteria (EARS)

- When a player opens the site without a room code, the client shall create a 4-letter room and put it in the URL.
- When a player opens a link with a room code, the client shall join that room in the lobby.
- While in the lobby, a player shall be able to change name, colour and hat, and every player shall see the change.
- When the host starts with bots enabled and fewer than 5 players, the server shall add bots up to 5 seats.
- If fewer than 3 players would play, then the server shall not start the round.
- When a round starts, the server shall deal 1 :( player (2 at 7 to 9 players, 3 at 10 to 12) and pick one thing.
- The server shall send the thing only to knowers, and never send roles, Pen reasons or accusation outcomes to anyone else.
- When a player places an item that fills a part of any catalog thing at that station's area, the server shall award 10 points privately.
- When a :( player at the board guesses right, the server shall end the round with the :( player winning; a wrong guess shall be silent and spend their only guess.
- When a player at the board accuses a :( player, the server shall send the accused to the Pen with a sign from the shared pool, keep the accuser free, and offer the accuser End now / Keep playing.
- When a player accuses a knower, the server shall send the accuser to the Pen with a sign from the same pool.
- When 20% of the round (max 90 s) remains, the server shall close the board (last call).
- When the timer ends, if any caught :( player exists, the server shall give them 15 s for a last-chance guess, then reveal.
- When the reveal happens, every client shall see the thing, each player's creation, pass or fail, and points.
- While the Pen holds players, the goat shall periodically stare at one of them, and that player shall see the NAUGHTY close-up.
- If a player reloads or reconnects with the same token, then the server shall return their seat, role and score.
- When a new player joins mid-round, the server shall make them a spectator until the next round.

## Feel check (Kyle)

- Does acting natural feel possible, or is the area a dead giveaway?
- Is walking speed right? Is the map too big or too small for 5?
- Do the score pops and chimes feel good?
- Is the NAUGHTY close-up funny or annoying? Too long?
- Are carried items readable from across the map?
