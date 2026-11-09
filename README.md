# Lewis Simulator: Oysterfleet Shift

You're Lewis: a very tall waiter at The Oysterfleet trying to get through one chaotic shift. Serve the tables, keep your dad Ian from kicking off, stop Ronnie "helping", and if it all goes wrong, volley a pensioner into the dessert trolley.

This is the **no-PC version** from the design doc. It's a WebXR game that runs in a web browser, so you can play it straight in the **Meta Quest 3 browser** ("Enter VR"). It also works on an iPad, a phone (touch controls) or a laptop (keyboard and mouse). You don't need to install anything or build anything.

## Play it on the Quest 3

1. Host the repo with GitHub Pages (you can do this from an iPad):
   - Open the repo on github.com and go to **Settings → Pages**.
   - Under "Build and deployment", set **Source: Deploy from a branch**.
   - Pick the branch (for example `main`, or `claude/cool-shannon-z4jlr1` until it's merged) and the **/ (root)** folder, then press **Save**.
   - After a minute the page shows your link, something like `https://tommymason111-tom.github.io/lewis-simulator/`.
2. Put the headset on, open the **Browser** and go to that link.
3. Pick a shift, press **🥽 Enter VR** and stand up. (Lewis is about 30 cm taller than you.)

Everything is in this repo, including Three.js in `lib/`, so the game doesn't rely on any other website. Progress is saved in that browser.

## Controls

| Action | Quest 3 | Keyboard + mouse | Touch |
|---|---|---|---|
| Move / turn | Left stick / right stick (snap turn) | WASD + mouse | Left stick + drag on the right side |
| Crouch (toggle) | **B** (tap) | C | CROUCH |
| Deep crouch | Hold **B** | Hold V | – |
| Grab / drop | **Grip** (either hand) | Left click (right hand), Q (left hand) | GRAB |
| Throw | Swing and let go of the grip | Right click, or flick the mouse and click | THROW |
| Talk / use / pour / wipe | **A** or trigger (hold to pour or wipe) | E (hold) | TALK |
| Kick the football | Swing a controller low and fast | F | KICK |
| Header | Lean your head into the ball | F when the ball is high | KICK |
| Sprint | Click the left stick | Shift | RUN |
| Radio Ronnie | **X** | R | RONNIE |
| Pause | **Y** | Esc / P | II |

On the Quest, your order pad and meters sit on your left wrist. Look at your hand to check them.

## What's in it

**Waiter loop**: seat groups from the door, crouch to take orders (standing over people like a lamp post costs tips), spike the ticket, pour pints/Monsters/mocktails/tap water at the bar, carry plates from the pass (stack up to 3 per hand), take the bill, wipe the table. Each table has a pint-glass patience meter. Drinks slosh if you rush, and dropped plates smash.

**The pub**: the Oysterfleet with low "Mind Your Head" beams. Walk into one standing up and you get a head-bonk (thunk, blurry screen, the regulars cheer). There's also a bar, kitchen pass, ticket spike, beer garden with a bin goal and a duck pond, kids' ball pit, dessert trolley, fruit machine, a TV you can change by hitting it with the ball, and Ian's van. The light changes with the time of the shift.

**Ragdolls**: every person is an active ragdoll. You can grab anyone by the head, arm, belt or ankle and throw them, and they knock over whoever they hit. Bonus chaos for landing someone in the ball pit, dessert trolley, duck pond, bins or fruit machine. Big throws trigger slow-mo.

**Football**: the ball is always around from Tuesday onwards. You can kick, head, dribble and do keepie-uppies. Football fans tip you for a worldie. Score in the bin goal (or off the toilet door) while the TV team scores for a big bonus.

**Ronnie**: stutter speech bubbles that type out one letter at a time while things go wrong behind you. His random "help":
- drops 6 plates
- takes table 4's food to table 7
- pours a 90%-foam pint
- gets stuck under a keg and blocks the taps
- seats customers in the kitchen (the chef throws them out)
- sweeps a handbag into the bin
- does press-ups in the walkway
- flirts with a stuttered pickup line
- reads the specials over the tannoy

You can send him to the staff room or radio him over. Hand him a Monster and he's actually useful for 45 seconds.

**Ian (Keep Ian Calm)**: his Kick-Off meter fills over the shift and he behaves worse as it rises (heckling, wandering off to argue, casting his rod, a speech from a chair). To calm him down:
- put a pint on his table
- crouch and pick the right line in the "Dad, sit down" talk
- put fishing on the TV
- carry him out to the beer garden (he comes back angrier)

If the meter fills, he melts down and the shift is over. On quiz night he needs your answers.

**Hollie**: she jogs in mid-shift. Serve her perfectly and every table's patience drains slower. She dodges if you try to throw her, and if you manage it she ignores you for 60 seconds. She chases down customers who do a runner, and on Thursday you hand her water bottles as she runs laps.

**Customers**: families with kids, pensioners, stag dos, complainers, influencers (the food goes cold while they take photos), football fans in kits, a secret food critic each shift, and the lads as friend cameos (Tommy, Harry H, Aidan, Noah, Oliver, Dylan) with in-jokes.

**Modes**:
- The full 7-shift campaign (Mon tutorial → Sun Big Roast finale)
- Lock-In sandbox (with a toy box)
- Gentle Giant
- Chaos Mode (combo multiplier)
- Daily Special: a rule that changes every day, like low gravity, everyone is Ian, or Ronnie is the manager

**Also included**:
- Staff-room upgrades bought with tips
- Achievements
- 7 hidden golden oysters (one is on top of the fridge where only Lewis can reach)
- Review cards after each table
- A newspaper headline about your worst moment at the end of the shift
- Group-chat banter pop-ups
- Character voices using the browser's text-to-speech

Settings include a "normal height" mode (no crouching, no bonks), seated mode, left-handed controls and smooth turning.

## Not done yet (from the design doc)

- Recording the friend group's real voices (text-to-speech stands in for now)
- Pub Cup 3v3, the penalty shootout, darts and pool
- The car-park boss arena (Sunday's finale happens in the pub)
- Multiplayer and mixed reality
- Photo mode and the replay theatre

## Files

- `index.html`: page, menus and styles
- `js/main.js`: renderer, menus, VR session
- `js/game.js`: shifts, scoring, TV, tutorial, results
- `js/serving.js`: customers, tables, orders, kitchen and bar
- `js/npcs.js`: Ronnie, Ian, Hollie, the regulars and the chef
- `js/people.js`: low-poly characters and verlet ragdolls
- `js/player.js`: VR, keyboard and touch input, grabbing, kicking, head bonks
- `js/world.js`: the pub, collisions, pathfinding
- `js/physics.js`: plates, pints and the football
- `js/hud.js`: wrist HUD, prompts, toasts, VR panels
- `js/data.js`: all the content: menu, lines, shifts, upgrades. **Edit this to add in-jokes.**
- `js/audio.js`: synthesised sound effects and voices

To test on a computer, run `python3 -m http.server` in this folder and open `http://localhost:8000`. In the browser console, `LEWIS` gives you the live game state.
