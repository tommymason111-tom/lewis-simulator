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
| Talk / pour / wipe | **A** or trigger (hold to pour or wipe) | E (hold) | TALK |
| Use held item (camera, sauce, extinguisher, mic) | Trigger | G or middle click | USE |
| Kick the football | Swing a controller low and fast | F | KICK |
| Header | Lean your head into the ball | F when the ball is high | KICK |
| Sprint | Click the left stick | Shift | RUN |
| Radio Ronnie | **X** | R | RONNIE |
| Pause | **Y** | Esc / P | II |

On the Quest, your order pad and meters sit on your left wrist. Look at your hand to check them.

## What's in it

**Waiter loop**: seat groups from the door, crouch to take orders (standing over people like a lamp post costs tips), spike the ticket, pour pints/Monsters/mocktails/tap water at the bar, carry plates from the pass (stack up to 3 per hand), take the bill, wipe the table. Each table has a pint-glass patience meter. Drinks slosh if you rush, plates smash if dropped, and the kitchen re-cooks anything that gets smashed or stolen.

**The Oysterfleet** (the pub from the Ronnie Simulator design doc):
- **Inside**: dark wood bar with brass taps, backlit bottle shelves, an etched mirror, sticky patterned carpet, beams, wooden booths, amber pendant lamps, a real fire with a mantel, frosted windows, two big screens, a fruit machine ("The Chip Machine"), and the Ronnie Simulator's joke signs (Staff of the Month: Ronnie, the staff rota, "Please do not feed the barman" and more).
- **Head bonks**: "Mind Your Head" beams, door frames and the pendant lampshades all catch Lewis on the forehead.
- **Function room** (opens Wednesday): pool, darts, karaoke stage, jukebox, a party table.
- **Outside**:
  - A brick front with a pitched roof, chimney, hanging baskets and a swinging oyster pub sign.
  - The street with lamp posts, a bench, an A-board and houses across the road.
  - **Beer garden**: decking, picnic tables with parasols, fairy lights, flower beds, patio heaters, a smoking shelter, the duck pond, a kids' slide, the BBQ.
  - **Car park**: parked cars, Ian's van, the skip, lamp posts.
  - **5-a-side pitch** (through the gate at the back of the garden): astroturf, floodlights, a chain-link cage, proper goals with nets and a dugout.

**Glasses, beers, wines and plates**: every occupied table gets drinks and plates on it when people sit down, and the bar has the regulars' pints, wine glasses and empties. All of it can be picked up and thrown at anyone, or anywhere.

**People**:
- **Ronnie**: stutter speech bubbles while things go wrong behind you, plus 9 kinds of bad "help". Send him to the staff room, radio him over, hand him a Monster, or crouch and arm-wrestle him.
- **Ian**: a big lad (about Noah's size) with white skin and grey hair, in full camo every shift. His Kick-Off meter, the "Dad, sit down" talk, quiz night, his ever-growing fishing story, the tannoy, paying with a fish.
- **Hollie**: serve her perfectly to calm every table. You can pick her up and throw her like anyone else (she won't speak to you for a minute afterwards). She chases runners, throws you a protein bar when your stamina's low, and her fitness watch counts your steps.
- **Customers**: families, pensioners, stag dos, complainers, influencers, football fans, a secret food critic, and the lads as cameos (Noah has Ian's build).

**Real models for Lewis, Ian and Ben**: the scanned models in `models/` (cut from 355k–509k triangles down to 20k each so the Quest can run them) are rigged automatically when the game loads. They walk, sit, get picked up and ragdoll like everyone else. If a model fails to load, that character falls back to the built-in look.

**Ben (the chef)**: works the kitchen behind the pass. Every so often he comes out through the kitchen door to hand Lewis a plate that's been sitting on the pass too long, or to nag him about a table ("I've got no ticket for table 4!", "Table 6 want the bill", "Table 2 are still waiting on drinks"). Once he's out of the kitchen, he can be thrown like anyone else.

**Other characters** (built from the Ronnie Simulator cast):
- **Ronnie**: black buzz cut, goatee, blue "RONNIE 10" shirt, grey joggers, sliders, MONSTOR can in his pocket.
- **Hollie**: same level of detail as the others.
- **The locals**: all old men (flat caps, cardigans, moustaches, a slight stoop).
- **The lads**: their Ronnie Simulator looks and club colours.

**Ragdolls**: everyone is an active ragdoll with elbows and knees, using the Ronnie Simulator rules: floaty 0.7× gravity, bouncy landings, a random spin when launched, getting up after 2–4 seconds with stars, comic impact words (POW! BOING! WALLOP!), and at most 6 ragdolls at once for Quest performance. You can grab anyone by the head, arm, belt or ankle and throw them, and they knock over whoever they hit. Big throws trigger slow-mo. Bonus spots to land people: ball pit, dessert trolley, duck pond, bins, fruit machine, pool table, karaoke stage and the skip.

**Football**: kick, head, dribble and do keepie-uppies, with commentary. Football fans tip for a worldie. Score while the TV team scores for a big tip. Toilet-door goal-line technology. The chef sends the ball back if it goes through the hatch.

**Random pub events** (each shift has its own mix):
- Fire alarm (walk everyone out to the street)
- Power cut (phone torch on, reset the fuse box)
- A dog stealing sausages
- A seagull nicking chips
- The keg running out (change it in the cellar)
- A birthday cake (carry it slowly or the candles blow out)
- A proposal (don't ruin it)
- The manager's inspection
- The health inspector (hide Ronnie)
- Toilets flooding (mop it up; customers slip)
- A rain storm (garden tables rush inside)
- A wedding party spilling in
- Ian's escaped crab
- Ian's deckchair in the middle of the restaurant
- Ronnie locked in the walk-in fridge
- Ronnie's protein shaker exploding
- The specials board catching fire while Ronnie stutters "f-f-f-FIRE" (use the fire extinguisher or throw a drink at it)
- Karaoke night
- A flickering light bulb (no ladder needed)
- A balloon stuck on the ceiling
- Where's Ian? (he's hiding in the hedge in camo)

**Toys**:
- Darts with real scoring (doubles, trebles, bullseye) and a record
- Pool with a cue (VR) or a look-and-shoot
- Knives that stick in the dartboard
- Ketchup, mustard and mayo bottles that leave sauce splats
- A fire extinguisher that sends you sliding backwards and knocks people over
- A jukebox with 3 tracks
- A karaoke mic
- A disposable camera: take photos and selfies, then download them from the menu

**Modes**:
- **One Week at the Oysterfleet**: 7 shifts, Mon tutorial → Sun Big Roast. Sunday ends with a **car-park boss fight**: Ian and the fishing club. Dodge his fishing-rod casts, bin the club in the skip, and calm him with pints, the bait bucket from his van, or a crouched chat. Finishing the week rolls the credits as a bar tab.
- **Mini-games**:
  - Pub Cup 3v3 (Lewis, Ronnie and Hollie vs the regulars)
  - Penalty shootout with camo Ian in goal
  - Trick shots: crossbar off a beam, a volley through the hatch, a chip into the ice bucket, three walls into the bin, 10 keepie-uppies
  - Hollie's 5K water station
  - Date night
  - Car Park Showdown
- **Seasonal**: Christmas Day (tinsel, a tree, Santa hats, snow), Halloween (costumes, pumpkins, power cuts), Summer BBQ (grill burgers yourself, seagulls).
- **Other**: Lock-In sandbox, Gentle Giant, Chaos Mode (combo multiplier), and a Daily Special rule that changes every day.

**Progress and extras**:
- Upgrades and a wardrobe (aprons including camo "for Dad", football shirts, the headband, a Monster-can hat, a Santa hat), all bought with tips
- 21 achievements
- 10 hiding spots for the 7 golden oysters. Find all 7 and the whole group turns up to raise a pint.
- An Employee of the Month board (get 4.5★ or more on every shift of the week)
- A Pub Cup team photo on the wall once you've won it
- Review cards after each table
- A newspaper headline about your worst moment
- A replay theatre for your best throw of the shift
- Ronnie Cam picture-in-picture, which comes with the order-pad upgrade on a flat screen
- Group-chat banter pop-ups

**Mixed reality**: on Quest 3 there's a "Mixed reality" button that uses passthrough. The walls disappear and the pub's tables and customers appear in your living room.

**Real voices: the Voice studio** (main menu). Pick a person (Ian, Ronnie, Hollie, the lads, Chef, Lewis's karaoke), hand them the iPad or phone, and record each line. Recordings play in the game straight away on that device. To get them onto the Quest:
- **Export voice pack** on the phone or iPad, then **Import** it on the Quest, or
- upload the exported `pack.json` to the repo's `voices/` folder, so everyone who opens the game gets the real voices.

Any line nobody has recorded falls back to the browser's text-to-speech.

Settings include a "normal height" mode (no crouching, no bonks), seated mode, left-handed controls and smooth turning.

## Not included

- **Online multiplayer** (one player as Lewis, another as Ronnie). This needs a server to connect two headsets, and this project is a plain web page with no server. It's the one item from the design doc that isn't built.

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
- `js/events.js`: random pub events and ambient extras
- `js/modes.js`: Pub Cup, penalties, trick shots, 5K, date night, car-park boss, seasonal decorations
- `js/toys.js`: darts, pool, jukebox, karaoke, fruit machine, sauces, extinguisher, camera
- `js/replay.js`: replay theatre
- `js/voice.js`: voice studio (record / import / export)
- `voices/pack.json`: shared voice recordings (empty until you upload one)
- `js/rig.js`, `js/glb.js`: loading and auto-rigging the scanned models in `models/`
- `js/data.js`: all the content: menu, lines, shifts, modes, events per shift, cosmetics, achievements, Ian's and Noah's builds. **Edit this to add in-jokes.**
- `js/audio.js`: synthesised sound effects and voices

To test on a computer, run `python3 -m http.server` in this folder and open `http://localhost:8000`. In the browser console, `LEWIS` gives you the live game state.
