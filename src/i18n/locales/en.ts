// English source bundle. Single source of truth for translation keys — every
// new player-facing string gets a key here first; the per-language files in
// this folder mirror the shape. Vite ships each non-English locale as its own
// lazy chunk (see `src/i18n/index.ts`).
export default {
  'gameName': 'Chaos Machine',
  'close': 'Close',
  'ok': 'Ok',
  'rewards': {
    'title': 'Extraction complete',
    'time': 'Time',
    'kills': 'Takedowns',
    'headshots': 'Headshots',
    'score': 'Score',
    'continue': 'To the base',
    'newBest': 'New best!'
  },
  'onlyAvailableOn': 'This game is only available on',
  'ui': {
    'next': 'Next',
    'replay': 'Replay',
    'back': 'Back',
    'play': 'Play',
    'pause': 'Pause',
    'menu': 'Menu',
    'home': 'Home',
    'info': 'Info',
    'mute': 'Mute',
    'unmute': 'Unmute',
    'skip': 'Skip'
  },
  'cine': {
    'intro': 'The drop',
    'salvage': 'The haul',
    'fallBastion': 'The Bastion falls',
    'fallFoundry': 'The Foundry goes cold',
    'outro': 'Home',
    'nextTarget': 'Next target'
  },
  'fortress': {
    'bastion': 'Bastion',
    'foundry': 'Foundry',
    'harbour': 'Harbour',
    'spire': 'Spire'
  },
  'hud': {
    'alert': 'Alert level',
    'strike': 'Strike',
    'decoy': 'Decoy',
    'weapons': 'Weapons',
    'ammo': 'Ammunition',
    'reloading': 'Reloading',
    'jump': 'Jump',
    'rope': 'Shoot a rope',
    'burn': 'Burn it to ash',
    'reserve': '{n} more carried',
    'heat': 'Weapon heat',
    'armor': 'Armor',
    'crouch': 'Crouch',
    'stand': 'Stand up',
    'sprint': 'Sprint',
    'grapple': 'Grappling hook',
    'grappleRecall': 'Recall the hook',
    'cancel': 'Lower weapon',
    'capture': 'Click to continue',
    'tapToStart': 'Tap to start',
    'clickToStart': 'Click to start',
    'metres': '{n} m',
    'objective': {
      'salvage': 'Salvage',
      'extract': 'Reach the extraction pad',
      'target': 'Target'
    },
    'haul': 'Salvage {n} of {need}',
    'hide': 'Hide in the box',
    'zoom': 'Zoom the scope',
    'cutPower': 'Cut the power',
    'jamServo': 'Jam the servo',
    'noBlade': 'No blade will take this one',
    'dragBody': 'Drag the body',
    'dropBody': 'Let go (into a container if one is at hand)',
    'sabotage': 'Sabotage the alarm beacon',
    'silence': 'Silence the ringing alarm',
    'alarmRunner': 'A guard is running to raise the alarm',
    'alarmLit': 'The alarm is raised',
    'boss': 'Boss health {n}%',
    'loot': 'Strip the salvage',
    'ammoLow': 'Running low on ammunition',
    'ammoOut': 'Out of ammunition',
    'noAmmo': 'No ammo!',
    'questLog': 'Objectives',
    'quest': {
      'extract': 'Extract'
    }
  },
  'defeat': {
    'title': 'Mech down',
    'repair': 'Full repair',
    'retry': 'Try again',
    'resume': 'From the first pile',
    'kept': 'Tech Scrap salvaged'
  },
  'base': {
    'deploy': 'Deploy',
    'training': 'Training',
    'learned': 'The base has learned',
    'answer': {
      'helmets': 'Helmets: your headshots were noticed',
      'boxCheck': 'Box checkers: a box that sits still gets poked',
      'perchLight': 'A searchlight now sweeps the perch'
    },
    'threat': 'Threat level',
    'locked': 'Clear level {n} first',
    'fortress': 'Fortress',
    'fortressLocked': 'Take the {name} at threat {n} first',
    'story': 'Story',
    'best': 'Best score',
    'armory': 'Armory',
    'chassis': 'Chassis Bay',
    'forge': 'Forge',
    'scrap': 'Tech Scrap',
    'cores': 'Data Cores',
    'blueprints': 'Blueprints',
    'nextMission': 'Next mission'
  },
  'track': {
    'sniperZoom': 'Scope zoom',
    'sniperDamage': 'Rifle damage',
    'sniperSilence': 'Silencer',
    'minigunCooling': 'Cooling',
    'minigunDamage': 'Mini-gun damage',
    'rocketBlast': 'Blast radius',
    'rocketAmmo': 'Rockets',
    'ammoRacks': 'Ammo racks',
    'armor': 'Armor plating',
    'speed': 'Servo speed',
    'decoy': 'Decoy duration',
    'hook': 'Hook reach'
  },
  'trackVerb': {
    'speed': 'Level 1: a quieter sprint',
    'decoy': 'Level 1: the next decoy is ready sooner'
  },
  'offer': {
    'refresh': 'Needs time to refresh, do some missions'
  },
  'workshop': {
    'max': 'Max',
    'buy': 'Upgrade {name}',
    'watch': 'Watch a video to upgrade {name}',
    'level': 'Level {n} of {max}'
  },
  'forge': {
    'tier': 'Tier {n}',
    'build': 'Build',
    'watch': 'Watch a video to build the next tier of the {name}',
    'top': 'Top tier',
    'lead': 'Every weapon is yours from the start. The Forge makes it hit harder.',
    'gain': 'Next tier: +{n}% damage',
    'infoOpen': 'What does the Forge do?',
    'infoTitle': 'The Forge',
    'info': {
      'lead': 'You already carry all three weapons. Building a tier here makes that weapon stronger in every mission after it.',
      'tiers': 'Tier: each bar is one tier. Every weapon starts at tier 1 and goes up to tier {max}.',
      'blueprints': 'Blueprints: "1/2" means you have 1 of the 2 blueprints the next tier needs. Every mission you get out of brings one, for each weapon in turn; the Ghost medal brings a second.',
      'scrap': 'Tech Scrap: the price of the next tier. Salvage, takedowns, headshots and the furnace after a mission earn it.',
      'build': 'Build: with the blueprints and the scrap in hand, the weapon goes up a tier at once: +{n}% damage for every tier.'
    }
  },
  'smithy': {
    'furnace': 'Furnace: hold the bellows to keep the heat in the band',
    'pump': 'Pump the bellows',
    'stars': '{n} of 3 stars'
  },
  'melt': {
    'start': 'Melt the haul: up to +{n}'
  },
  'wheel': {
    'title': 'Lucky wheel',
    'locked': 'Max out rifle damage to open the wheel',
    'chance': 'Win chance',
    'gain': 'Next win',
    'spin': 'Spin',
    'sure': 'Sure win',
    'watch': 'Watch a video for a sure win',
    'won': 'Rifle damage +{n}',
    'miss': 'Missed: {n} scrap back',
    'pity': 'A sure win in {n} spins'
  },
  'disguise': {
    'title': 'Disguises',
    'toaster': 'Toaster',
    'crate': 'Sneaky crate',
    'clown': 'Clown box',
    'horse': 'Trojan horse',
    'bush': 'Bush',
    'teddy': 'Teddy bear',
    'wear': 'Wear the {name}',
    'wearShort': 'Wear',
    'unlock': 'Unlock the {name}',
    'watch': 'Watch a video to unlock the {name}'
  },
  'paint': {
    'title': 'Paint schemes',
    'lilac': 'CM-07 Lilac',
    'crimson': 'Crimson',
    'arctic': 'Arctic',
    'jungle': 'Jungle',
    'gilded': 'Gilded',
    'midnight': 'Midnight',
    'tangerine': 'Tangerine',
    'equip': 'Paint the mech {name}',
    'equipShort': 'Equip',
    'equipped': 'Equipped',
    'unlock': 'Unlock {name}',
    'watch': 'Watch a video to unlock {name} for good',
    'try': 'Watch a video to try {name} for one mission',
    'tryShort': 'Try 1 mission',
    'lent': 'Yours for the next mission',
    'noVideo': 'No video right now',
    'back': 'Back in {time}'
  },
  'ads': {
    'blockedTitle': 'Ads blocked',
    'blockedBody': 'An ad blocker stopped the video, so there is no reward this time.',
    'ok': 'OK'
  },
  'medal': {
    'ghost': 'Ghost',
    'marksman': 'Marksman',
    'swift': 'Swift'
  },
  'hint': {
    'look': 'Look around',
    'scope': 'Aim',
    'fire': 'Fire',
    'climb': 'Climb',
    'help': 'Show controls'
  },
  'leaderboard': {
    'title': 'Leaderboard',
    'rank': '#',
    'player': 'Player',
    'score': 'Score',
    'flair': 'Level',
    'empty': 'No runs posted yet. Be the first.',
    'failed': 'Couldn\'t reach the leaderboard.',
    'loading': 'Loading…',
    'you': 'You',
    'yourRank': 'You are #{n} of {total}',
    'of': 'of {n} players',
    'tabGlobal': 'Global'
  },
  'callout': {
    'human': 'Intruder! Alarm!',
    'machine': 'Enemy detected! Erase intruder!'
  },
  // CM-07's one-liners (#126).
  'quip': {
    'burnHuman': 'Rest in peace. Or burn in hell?',
    'burnMachine': 'Recycled. You\'re welcome, planet.',
    'headshot': 'Another one bites the dust!',
    'alarm': '6, 7!',
    'lowHealth': 'Time to tighten my screws!',
    'lowAmmo': 'Almost out of ammo, looking for stones to throw.',
    'noAmmo': 'Out of ammo.',
    'takedown': 'Shhh. Nap time.',
    'decoy': 'Look, a handsome stranger!',
    'disguise': 'Best toaster in the business.',
    'multiKill': 'Two for the price of one!',
    'allClear': 'Nothing to see here, folks.',
    'extract': 'CM-07 has left the building!',
    'loot': 'Ooh, shiny!'
  },
  // The missions' names on the deploy cards (jam build: one fortress per threat level).
  'mission': {
    '1': 'The Bastion',
    '2': 'Sea Fort',
    '3': 'Steel Keep'
  },
  'training': {
    'replay': 'Show me again',
    'progress': 'Training: {n} of {total} lessons done',
    'scrapWhy': 'Scrap buys upgrades for your weapons back at the Command Base.',
    'bladeHint': 'Sneak up to the guards and backstab them, so they don\'t raise the alarm!',
    'decoyHint': 'Place a decoy to distract the guard, then sneak up and assassinate him!',
    'roomHint': {
      'move': 'Walk over to the glowing door to start your training.',
      'jump': 'Climb the ladder and jump across the gap to the other platform! Running and jumping make noise that nearby guards hear.',
      'cover': 'Crouch behind the crates so the sentry can\'t see you, then crawl under the gate! Only a crouched step is silent: guards hear you walk up close.',
      'weapons': 'Switch to the minigun and take out all three guards! Shots make noise: the minigun is heard by every guard around.',
      'rocket': 'Switch to the rocket launcher and blow up the mech on the ledge! Rockets are loud: every guard hears the blast.',
      'hide': 'Take out the guard! If you shoot, move away and hide: the drone checks where the shot came from.',
      'supply': 'Walk over the crates to refill your ammo and repair your armour.',
      'burn': 'Burn the body with the flamethrower before anyone finds it!',
      'box': 'Put on your disguise! The searchlight ignores you while you stand still, but spots you the moment you move.',
      'hook': 'Use the grappling hook to get over the wall!',
      'rope': 'Use the rope gun to create a rope between the two platforms!',
      'barrel': 'Shoot the fuel barrel to take out the guards behind the wall!',
      'extract': 'Walk to the extraction point to finish your training!',
    },
    'skip': 'Skip training',
    'goal': 'Take down all three',
    'goalProgress': '{n} of {total} down',
    'shout': {
      'backstab': 'Backstab them'
    },
    'reset': {
      'cover': 'Seen. Stay crouched behind the cover.',
      'seen': 'Seen. The room starts over.',
      'ammo': 'Ammo depleted! Try again!',
      'box': 'Disguise yourself, to not get spotted',
      'decoy': 'Use a decoy [{key}], backstab when distracted',
      'decoyTouch': 'Use a decoy, backstab when distracted',
      'decoyAny': 'Seen again. Take the guard down any way you like.',
      'hide': 'Hide after shooting: move somewhere else, or the enemy finds where you shot from.'
    },
    'door': {
      'cover': 'Crouch and crawl under the gate',
      'coverCrawl': 'Crawl under the gate',
      'weapons': 'Take down all three to pass',
      'rocket': 'Destroy the mech with the launcher',
      'hide': 'Take out the guard',
      'supply': 'Pick up the supplies',
      'blade': 'Backstab both guards',
      'burn': 'Burn the body',
      'decoy': 'Throw a decoy, then backstab the guard',
      'rope': 'Shoot a rope across',
      'salvage': 'Collect the salvage'
    }
  },
  'pause': {
    'title': 'PAUSED',
    'resume': 'Resume',
    'retreat': 'Retreat to base',
    'retreatSure': 'Leave the raid? Tap again',
    'controls': 'Controls'
  },
  'options': {
    'killCams': 'Kill-cam',
    'sensitivity': 'Look sensitivity',
    'scopeSensitivity': 'Scope sensitivity',
    'gameplay': 'Gameplay',
    'title': 'Options',
    'general': 'General',
    'language': 'Language',
    'soundEffects': 'Sound Effects',
    'music': 'Music',
    'haptics': 'Vibration',
    'on': 'On',
    'off': 'Off',
    'close': 'Close',
    'keyboard': {
      'auto': 'Detect keyboard layout',
      'layout': 'Keyboard layout',
      'detected': 'Detected: {layout}',
      'bindings': 'Key bindings',
      'press': 'Press a key… (Esc to cancel)',
      'reset': 'Reset keys'
    },
    'actions': {
      'forward': 'Move forward',
      'back': 'Move back',
      'left': 'Strafe left',
      'right': 'Strafe right',
      'turnLeft': 'Turn left',
      'turnRight': 'Turn right',
      'sprint': 'Sprint',
      'crouch': 'Crouch',
      'act': 'Strike / use',
      'grapple': 'Grappling hook',
      'hide': 'Hide box',
      'decoy': 'Deploy decoy',
      'reload': 'Reload',
      'weapon1': 'Sniper rifle',
      'weapon2': 'Mini-gun',
      'weapon3': 'Rocket launcher',
      'cycle': 'Next weapon',
      'pause': 'Pause',
      'help': 'Show the lessons',
      'jump': 'Jump',
      'rope': 'Rope gun',
      'burn': 'Flamethrower',
      'drag': 'Grab body',
      'replay': 'Show the lesson again'
    }
  },
  'prompt': {
    'salvage': 'Salvage',
    'strike': 'Backstab',
    'assassinate': 'Assassinate',
    'sabotage': 'Sabotage',
    'silence': 'Silence alarm',
    'cutPower': 'Cut power',
    'jam': 'Jam servo',
    'grab': 'Grab body',
    'drop': 'Drop body',
    'hook': 'Hook',
    'rope': 'Rope',
    'burn': 'Burn'
  },
  'saveStatus': {
    'restoredTitle': 'Cloud save restored',
    'restoredBody': 'Recovery bonus: +{n}',
    'tap': 'tap',
    'pausedTitle': 'Cloud sync paused',
    'pausedBody': 'Playing offline. Your progress is saved here.',
    'retry': 'Retry',
    'dismiss': 'dismiss'
  },
  'loading': {
    'tooLong': 'Loading taking too long? Try disabling your ad blocker and refresh.'
  },
  'license': {
    'denied': 'Access Denied: Please purchase a license.'
  },
  'banner': {
    'cleared': 'Level cleared',
    'wasted': 'Wasted'
  }
}
