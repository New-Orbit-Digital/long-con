// Flavor text: name parts, hooks per bankroll band, tell phrases per tell band.
// 1980s boiler room. Pure data, no logic.

export const FIRST_NAMES = [
  'Gary', 'Doug', 'Marvin', 'Sheldon', 'Earl', 'Dale', 'Lyle', 'Norm',
  'Howard', 'Phil', 'Carl', 'Wendell', 'Herb', 'Stu', 'Lloyd', 'Rusty',
  'Bev', 'Linda', 'Doreen', 'Marcy', 'Peggy', 'Joanne', 'Rhonda', 'Gail',
];

export const SURNAMES = [
  'Pruitt', 'Kowalski', 'Feeney', 'Mulvaney', 'Hartsock', 'Dombrowski', 'Pfeiffer', 'Tuttle',
  'Gorski', 'Lindqvist', 'Szabo', 'Henley', 'Wachowski', 'Birnbaum', 'Crandall', 'Esposito',
  'Fairbanks', 'Grubb', 'Oakes', 'Plunkett', 'Riordan', 'Stebbins', 'Voight', 'Yablonski',
];

// A job plus a circumstance. The hook hints at the bankroll; it never names a number.
export const HOOKS = {
  low: [
    'Shoe salesman, just won a meat raffle',
    'Night watchman, reads Forbes on the clock',
    'Driving instructor, nerves already shot',
    'Bowling alley manager, owed back pay',
    'Substitute teacher, summer coming up',
    'Mall Santa, off-season',
    'Retired mailman, still walks the route',
    'Assistant manager at a Radio Shack, wants to be manager',
    'Hot dog cart owner, two carts if this works',
    'Widow, husband left a coffee can',
    'Tow truck driver, paid in cash, keeps it in a boot',
    'Dental hygienist, saw a guy on Donahue do this',
    'Cab driver, tips all in singles',
    'Encyclopedia salesman, knows the pitch, falls for it anyway',
    'Vacuum repairman, birthday money from his mother',
    'Bingo caller, the church does not know',
    'Junior high wrestling coach, bought a Members Only jacket on credit',
  ],
  mid: [
    'Orthodontist, wife just left',
    'Car dealership finance guy, knows what APR is, still on the line',
    'Insurance adjuster, just closed a big flood season',
    'Pharmacist, second boat is a rowboat and he hates it',
    'Pool contractor, recession-proof he says',
    'Divorce lawyer, ironically',
    'Chiropractor, cracks his knuckles while he talks',
    'Regional manager for a carpet outlet, has a Rolodex',
    'Airline pilot, home three days a week and bored',
    'Veterinarian, sold the practice to his partner',
    'Liquor store owner, two locations, one near a college',
    'Commercial real estate guy, between closings',
    'High school principal, the pension feels small lately',
    'Funeral director, business is steady',
    'Franchise owner, three Sbarros and a dream',
    'Optometrist, sees a lot of fine print, reads none of it',
    'Dairy farmer, just sold the north forty',
  ],
  high: [
    'Plastic surgeon, flies his own Cessna',
    'Heir to a frozen-foods fortune, has never worked',
    'Retired Eastern Airlines executive, golden parachute still open',
    'Cardiologist, calls from the car phone',
    'Shopping mall developer, owns the parking lots too',
    'Oil man from Midland, misses 1981',
    'Dermatologist, owns racehorses that lose',
    'Bottling plant owner, sells to three states',
    'Corporate raider\'s accountant, picks up on the first ring',
    'Widow of a senator, the cat has a trust',
    'Yacht broker, between yachts, has two',
    'Cable TV pioneer, owns a channel nobody watches',
    'Defense contractor, can\'t say which part',
    'Neurosurgeon, his golf handicap is the only thing he lies about',
    'Real estate developer, just named a cul-de-sac after himself',
    'Car wash magnate, forty-two locations, zero towels',
    'Retired Merrill Lynch partner, says he can smell a con',
  ],
};

// Tell phrases by tell band. The tell is how the player reads Suspicion.
export const TELLS = {
  calm: [
    'Asks how to get his brother in.',
    'Says you remind him of his son.',
    'Asks if you take traveler\'s checks.',
    'Wants to know if this is like what Gordon Gekko does.',
    'Says his wife will be thrilled, eventually.',
    'Puts you on speaker so the guys at the lodge can hear.',
    'Asks if there is a newsletter.',
    'Calls you "partner" twice.',
  ],
  uneasy: [
    'Asks what the minimum is.',
    'Mentions his accountant.',
    'Asks what the name of the firm is again.',
    'Wants to know why the area code is Florida.',
    'Says he read something in Money magazine.',
    'Asks if you are calling from a bank of phones.',
    'Pauses a long time after "guaranteed."',
  ],
  wary: [
    'Asks about withdrawal terms.',
    'Wants it in writing.',
    'Asks for your direct line, not the switchboard.',
    'Wants to know if you are registered.',
    'Says his brother-in-law sells real stocks.',
    'Asks you to spell your last name. Slowly.',
    'Asks why you need his routing number for a brochure.',
  ],
  'about-to-bolt': [
    'Says he\'ll call you back.',
    'Mentions a nephew at the SEC.',
    'Says the line sounds funny.',
    'Asks if this call is being recorded. Hopes it is.',
    'Says 60 Minutes did a thing on outfits like yours.',
    'Has started writing things down.',
    'Puts his wife on. She has questions.',
  ],
};

export const TELL_BANDS = ['calm', 'uneasy', 'wary', 'about-to-bolt'];
