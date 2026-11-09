// All the content: menu, customers, shifts, lines, upgrades.

export const DISHES = {
  fish:     { name: 'Fish & chips', icon: '🐟', color: 0xe8a33d },
  roast:    { name: 'Sunday roast', icon: '🍖', color: 0x8a5a2b },
  burger:   { name: 'Burger', icon: '🍔', color: 0xb5651d },
  kids:     { name: "Kids' meal", icon: '🍗', color: 0xf2c14e },
  oysters:  { name: 'Oysters', icon: '🦪', color: 0xc9c9c0 },
  pancakes: { name: 'Protein pancakes', icon: '🥞', color: 0xe0b060, hollie: true },
  salad:    { name: 'Salad', icon: '🥗', color: 0x5bbf4a, hollie: true },
};
export const DRINKS = {
  pint:     { name: 'Pint', icon: '🍺' },
  monster:  { name: 'Monster', icon: '🥫' },
  mocktail: { name: 'Mocktail', icon: '🍹' },
  water:    { name: 'Tap water', icon: '💧' },
};
export const isDrink = (id) => id in DRINKS;
export const iconFor = (id) => (DISHES[id] || DRINKS[id] || { icon: '?' }).icon;
export const nameFor = (id) => (DISHES[id] || DRINKS[id] || { name: id }).name;

export const MAIN_DISHES = ['fish', 'roast', 'burger', 'oysters'];

// Customer types. patience = seconds of pint-glass meter; drain multiplier etc.
export const CUSTOMER_TYPES = {
  family:     { label: 'Family', size: [3, 4], patience: 120, walk: 1.1, tip: 1.0, kids: true, colors: [0x4a7bd1, 0xd14a6b, 0x6bd14a, 0xe0c040] },
  pensioner:  { label: 'Pensioners', size: [2, 2], patience: 190, walk: 0.6, tip: 1.1, scale: 0.92, spectacular: true, colors: [0x8a7f99, 0x9c8b6e, 0x6e8b9c] },
  stag:       { label: 'Stag do', size: [4, 6], patience: 100, walk: 1.3, tip: 0.9, loud: true, colors: [0xff3355, 0xff3355, 0x222222] },
  karen:      { label: 'Complainer', size: [1, 2], patience: 70, walk: 1.0, tip: 0.8, drain: 2, colors: [0xc06090, 0xdddddd] },
  influencer: { label: 'Influencer', size: [1, 2], patience: 110, walk: 1.0, tip: 1.0, photos: true, colors: [0xff88cc, 0xffffff] },
  critic:     { label: 'Couple', size: [1, 1], patience: 120, walk: 1.0, tip: 1.0, critic: true, colors: [0x333344] },
  fan:        { label: 'Football fans', size: [2, 4], patience: 110, walk: 1.2, tip: 1.0, fan: true, colors: [0x1d4fd8, 0xd81d1d, 0xffffff] },
  friends:    { label: 'The lads', size: [3, 6], patience: 130, walk: 1.2, tip: 1.2, friends: true, colors: [0x2a9d8f, 0xe76f51, 0x264653, 0xf4a261, 0x8ab17d, 0x6d597a] },
};

export const FRIENDS = ['Tommy', 'Harry H', 'Aidan', 'Noah', 'Oliver', 'Dylan'];

// Lines -----------------------------------------------------------------
export const LINES = {
  greet: ['How\'s the weather up there?', 'Blimey, you\'re tall!', 'Mind your head, mate!', 'Are you on stilts?', 'Can we order?'],
  kidGreet: ['Are you a giant?', 'Can I have a shoulder ride?', 'Woah! He\'s HUGE!'],
  lampPost: ['Could you... come down here?', 'I\'m getting a neck ache.', 'It\'s like ordering from a lamp post.'],
  crouchGreet: ['Oh, lovely, thanks.', 'Ah, there you are!', 'Perfect, thanks love.'],
  wrong: ['That\'s not what I ordered.', 'Erm, I asked for something else.', 'Is this for us?'],
  happy: ['Lovely, cheers!', 'Ooh, that looks great.', 'Perfect!', 'Spot on, mate.'],
  annoyed: ['Is our food coming?', 'We\'ve been waiting ages.', 'Hello? Waiter?'],
  walkout: ['That\'s it, we\'re off!', 'One star. ONE.', 'Never coming back!'],
  thrown: ['WHAT WAS THAT?!', 'My hip!', 'I\'m telling your manager!', 'OOOF!', 'Put me DOWN!'],
  karen: ['Can I see the manager?', 'This is unacceptable.', 'I\'ll be leaving a review.'],
  stag: ['OGGY OGGY OGGY!', 'STAG DO! STAG DO!', 'Put the footy on!', 'Here we go, here we go!'],
  fan: ['Get it on the telly!', 'WHAT A WORLDIE!', 'Do some keepie-uppies, big man!'],
  influencer: ['Wait, don\'t eat yet, I need a pic.', 'Can you move? You\'re in my shot.', 'The lighting in here is so bad.'],
  pensioner: ['Lovely young man.', 'In my day the waiters were shorter.', 'Is the fish fresh?'],
  friends: {
    Tommy: ['Alright lanky! Need a ladder?', 'Lewis, you\'ve grown again.', 'Tell Ian I said hi... actually don\'t.'],
    'Harry H': ['Big man! Pint, please!', 'Lewy! Can you reach the top shelf?'],
    Aidan: ['Is it true you hit every beam?', 'I\'ll have whatever\'s quickest.'],
    Noah: ['Mate, duck. DUCK.', 'Get the football out!'],
    Oliver: ['Can we get a group photo with the giant?', 'Ronnie\'s having a nightmare.'],
    Dylan: ['Lewis! Lewis! LEWIS! ...hi.', 'Is Ian in tonight? Brilliant.'],
  },
  ian: {
    calm: ['Lewy, look at this carp. LOOK at it.', 'Caught a beauty Sunday, Lewy.', 'Lovely pub this, Lewy.', 'I\'ve caught bigger fish than this in the canal, Lewy.'],
    grumble: ['LEWY, sort this out.', 'Lewy, where\'s my pint?', 'Ref! REF! You\'re blind!', 'Lewy, I want a word with the chef.'],
    wound: ['I\'m not shouting, Lewy, I\'m projecting!', 'Lewy, tell him, Lewy!', 'LEWY! Look at the size of this one!', 'Back in my day you could smoke in here, Lewy.'],
    blow: ['RIGHT. LISTEN UP, EVERYONE!', 'Who wants an arm wrestle? YOU, stag boy!', 'THIS PUB HAS GONE DOWNHILL, LEWY!'],
    pint: ['That\'s more like it, Lewy.', 'Good lad, Lewy.', 'Ahh. Lovely.'],
    hit: ['LEWY!', 'OI! LEWY!', 'Was that you, Lewy?!'],
    fishing: ['Ooh, fishing! Turn it up, Lewy!', 'Look at that pike, Lewy!'],
    thrown: ['LEWY! PUT ME DOWN!', 'I\'m your FATHER, Lewy!'],
    farmed: ['Farmed rubbish, that fish.', 'That\'s not a fish, Lewy, that\'s a sardine.'],
  },
  ronnie: {
    hello: ['L-L-Lewis! I\'m h-h-here to help!', 'I\'ve g-g-got this, Lewis.'],
    staffRoom: ['F-f-fine. I\'ll g-go and do some c-curls.', 'S-s-staff room? B-but I\'m h-helping!'],
    back: ['I\'m b-b-back! M-missed me?', 'B-b-bored. W-what are we doing?'],
    flex: ['G-g-gains.', 'D-d-didn\'t even h-hurt.', 'I d-dropped it but I l-l-lifted it back up. Gains.'],
    radio: ['C-c-coming, Lewis!', 'On m-m-my way!'],
  },
  hollie: {
    arrive: ['Hiya babe! Just finished my 5K!', 'Babe! Quick lap, then food.'],
    happy: ['Babe, you\'ve got this.', 'Perfect, thank you!', 'That\'s my boy.'],
    dodge: ['Nope!', 'Too slow!', 'Did you just try to throw me?'],
    offended: ['Did you just throw that... at ME?', 'Not talking to you.'],
    chase: ['On it!', 'Leave it to me!'],
    water: ['Cheers babe!', 'Hydration!'],
  },
  chef: ['OUT OF MY KITCHEN!', 'NOT IN HERE, LANKY!'],
  regulars: ['OHHHHH!', 'MIND YOUR HEAD!', 'HAHAHA!', 'AGAIN! AGAIN!'],
  groupChat: [
    'Tommy: how\'s work lanky 😂', 'Harry H: is Ian in?? 👀', 'Dylan: Ronnie just posted a gym selfie from the walk-in fridge',
    'Noah: 5 a side tomorrow?', 'Oliver: bring us chips after', 'Aidan: have u hit ur head yet', 'Hollie: love u babe x',
  ],
};

export const TALK_OPTIONS = [
  { right: 'Dad, sit down. I\'ll bring you a pint.', wrong: ['Dad, camo isn\'t a dress code.', 'Dad, that carp was tiny.'] },
  { right: 'Tell me about the big one you caught.', wrong: ['Shh, people are staring.', 'Ronnie said you\'re loud.'] },
  { right: 'Dad, the fishing\'s on in a minute.', wrong: ['Dad, the fish is farmed, by the way.', 'Calm down, old man.'] },
  { right: 'You\'re my favourite customer, Dad.', wrong: ['I\'ll get Hollie to deal with you.', 'Dad, you\'re embarrassing me.'] },
];

export const QUIZ = [
  { q: 'What\'s the biggest fish in a UK canal?', right: 'Pike, obviously', wrong: ['A shopping trolley', 'Ronnie'] },
  { q: 'How many players in a football team?', right: 'Eleven', wrong: ['Twelve', 'Ronnie and ten mates'] },
  { q: 'What does Monster Mango Loco taste of?', right: 'Mango-ish', wrong: ['Gains', 'Fish'] },
  { q: 'Capital of England?', right: 'London', wrong: ['The Oysterfleet', 'Canvey'] },
];

// Campaign --------------------------------------------------------------
// Every shift: duration (s), table ids open, spawn interval, type weights, features.
export const SHIFTS = [
  { id: 'mon', day: 'Mon', name: 'First Day Again', twist: 'Tutorial: crouch, carry, take orders. Ronnie introduces himself (it takes a while).',
    duration: 330, tables: [1, 2, 3, 5, 6], interval: 38, maxGroups: 4,
    types: { family: 3, pensioner: 3, friends: 1 }, tutorial: true, garden: false, ianRate: 0.25, ronnieEvery: [70, 110], hour: 12 },
  { id: 'tue', day: 'Tue', name: 'Quiet Lunch', twist: 'Beer garden opens and the football is unlocked.',
    duration: 400, tables: [1, 2, 3, 4, 5, 6, 9, 10], interval: 32, maxGroups: 5,
    types: { family: 2, pensioner: 3, fan: 2, influencer: 1, friends: 1, critic: 1 }, garden: true, ianRate: 0.35, ronnieEvery: [55, 90], hour: 13 },
  { id: 'wed', day: 'Wed', name: 'Quiz Night', twist: 'Quiz night. Ian enters the quiz and needs answers from you.',
    duration: 420, tables: [1, 2, 3, 4, 5, 6, 7, 8], interval: 30, maxGroups: 6,
    types: { family: 1, pensioner: 2, friends: 2, karen: 1, influencer: 1, critic: 1 }, garden: true, quiz: true, ianRate: 0.45, ronnieEvery: [50, 85], hour: 19 },
  { id: 'thu', day: 'Thu', name: "Hollie's Training Day", twist: 'Hollie runs laps. Hand her water bottles as she passes.',
    duration: 420, tables: [1, 2, 3, 4, 5, 6, 7, 9, 10], interval: 29, maxGroups: 6,
    types: { family: 2, pensioner: 2, fan: 1, karen: 1, influencer: 1, critic: 1 }, garden: true, hollieLaps: true, hollieEarly: true, ianRate: 0.45, ronnieEvery: [50, 85], hour: 17 },
  { id: 'fri', day: 'Fri', name: 'Stag Do', twist: 'Loud lads, chants and mass ragdoll potential.',
    duration: 450, tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], interval: 26, maxGroups: 7,
    types: { stag: 4, friends: 1, karen: 1, pensioner: 1, critic: 1, fan: 1 }, garden: true, stagStart: true, ianRate: 0.55, ronnieEvery: [45, 75], hour: 20 },
  { id: 'sat', day: 'Sat', name: 'Match Day', twist: 'Pub packed with fans. Score while the TV team scores for a huge tip.',
    duration: 450, tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], interval: 24, maxGroups: 8,
    types: { fan: 5, stag: 1, friends: 1, karen: 1, critic: 1 }, garden: true, matchDay: true, ianRate: 0.6, ronnieEvery: [45, 75], hour: 15 },
  { id: 'sun', day: 'Sun', name: 'The Big Roast', twist: 'Every table books. Ian brings his whole fishing club. Survive the finale.',
    duration: 480, tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], interval: 22, maxGroups: 9,
    types: { family: 3, pensioner: 3, friends: 1, karen: 1, critic: 1, fan: 1 }, garden: true, roast: true, fishingClub: true, finale: true, ianRate: 0.7, ronnieEvery: [40, 70], hour: 18 },
];

export const MODES = {
  sandbox: { id: 'sandbox', day: '∞', name: 'Lock-In (Sandbox)', twist: 'Pub after closing. Endless customers, no score, pure chaos. Press A/E at the bar end for the toy box.',
    duration: Infinity, tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], interval: 25, maxGroups: 6,
    types: { family: 2, pensioner: 2, stag: 2, fan: 2, friends: 2, karen: 1 }, garden: true, ianRate: 0.0, ronnieEvery: [60, 100], hour: 23, sandbox: true },
  gentle: { id: 'gentle', day: 'GG', name: 'Gentle Giant', twist: 'Perfect service challenge. Throw anyone and the shift is over.',
    duration: 360, tables: [1, 2, 3, 4, 5, 6, 7], interval: 30, maxGroups: 5,
    types: { family: 2, pensioner: 2, karen: 1, influencer: 1, critic: 1 }, garden: true, ianRate: 0.4, ronnieEvery: [55, 90], hour: 14, gentle: true },
  chaos: { id: 'chaos', day: '!!', name: 'Chaos Mode', twist: 'Score only from ragdolls and destruction. Chain it for a combo multiplier.',
    duration: 240, tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], interval: 14, maxGroups: 9,
    types: { stag: 2, pensioner: 2, fan: 2, family: 1, karen: 1 }, garden: true, ianRate: 0, ronnieEvery: [30, 50], hour: 21, chaos: true },
  special: { id: 'special', day: '★', name: 'Daily Special', twist: 'A new random rule every day.',
    duration: 360, tables: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], interval: 28, maxGroups: 6,
    types: { family: 2, pensioner: 2, stag: 1, fan: 1, friends: 1, karen: 1, critic: 1 }, garden: true, ianRate: 0.45, ronnieEvery: [50, 80], hour: 16, special: true },
};

export const SPECIAL_RULES = [
  { id: 'everyoneIan', name: 'Everyone is Ian', desc: 'Every customer wears full camo. Good luck finding Dad.' },
  { id: 'lowGravity', name: 'Low gravity', desc: 'Throws go to the moon. So do pints.' },
  { id: 'ronnieManager', name: 'Ronnie is the manager', desc: 'Ronnie "helps" twice as often.' },
  { id: 'bigHeads', name: 'Big head mode', desc: 'Everyone\'s head is massive. Except Lewis\'s.' },
  { id: 'butterFingers', name: 'Butterfingers', desc: 'Everything smashes. Everything.' },
];

export const UPGRADES = [
  { id: 'walk', name: 'Faster walk', desc: '+20% walking speed. Those legs were made for this.', cost: 40 },
  { id: 'stack', name: 'Tall Waiter Stack', desc: 'Carry one extra plate per hand.', cost: 60 },
  { id: 'shoes', name: 'Non-slip shoes', desc: 'Pints barely slosh when you rush.', cost: 50 },
  { id: 'pad', name: 'Better order pad', desc: 'Pad shows patience timers and Ronnie Cam.', cost: 35 },
  { id: 'charm', name: 'Gentle giant charm', desc: 'Customers are 15% more patient with you.', cost: 80 },
];

export const ACHIEVEMENTS = {
  mindYourHead: { name: 'Mind Your Head', desc: 'Bonk your head 10 times in one shift.' },
  gentleGiant: { name: 'Gentle Giant', desc: 'Finish a shift without throwing anyone.' },
  worldie: { name: 'Worldie', desc: 'Hit a football fan with a screamer. They tipped you for it.' },
  keepie10: { name: 'Keepie King', desc: '10 keepie-uppies in the pub.' },
  oysters7: { name: 'Golden Oysters', desc: 'Find all 7 hidden golden oysters.' },
  fiveStar: { name: 'Employee of the Month', desc: 'Five-star shift.' },
  calmIan: { name: 'Dad Whisperer', desc: 'Finish a shift with Ian calm.' },
  trolley: { name: 'Pudding Delivery', desc: 'Throw someone into the dessert trolley.' },
  pond: { name: 'Duck Duck Goose', desc: 'Throw someone into the duck pond.' },
};

export const REVIEWS = {
  1: ['★ Got volleyed by a giant. Food was cold.', '★ Waiter was a lamp post. Never again.', '★ Some man in camo shouted at my fish.'],
  2: ['★★ Long wait, short pint, tall waiter.', '★★ A gym lad dropped six plates near us.'],
  3: ['★★★ Fine. The waiter hit his head four times.', '★★★ Decent roast. Loud dad at the window.'],
  4: ['★★★★ Lovely service from the tall lad!', '★★★★ Great fish. Shame about the stuttering.'],
  5: ['★★★★★ Lewis is a legend. Crouched and everything.', '★★★★★ Best pub in Essex. Tall waiter, big heart.'],
};
