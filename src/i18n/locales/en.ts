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
    'outro': 'Home'
  },
  'fortress': {
    'bastion': 'Bastion',
    'foundry': 'Foundry',
    'harbour': 'Harbour'
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
    'metres': '{n} m',
    'objective': {
      'salvage': 'Salvage',
      'extract': 'Reach the extraction pad'
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
    'alarmRunner': 'A guard is running to raise the alarm',
    'alarmLit': 'The alarm is raised',
    'boss': 'Boss health {n}%',
    'loot': 'Strip the salvage'
  },
  'defeat': {
    'title': 'Mech down',
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
    'blueprints': 'Blueprints'
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
  'workshop': {
    'max': 'Max',
    'buy': 'Upgrade {name}',
    'level': 'Level {n} of {max}'
  },
  'forge': {
    'tier': 'Tier {n}',
    'build': 'Build',
    'top': 'Top tier'
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
    'takedown': 'Shhh. Nap time.',
    'decoy': 'Look, a handsome stranger!',
    'disguise': 'Best toaster in the business.',
    'multiKill': 'Two for the price of one!',
    'allClear': 'Nothing to see here, folks.',
    'extract': 'CM-07 has left the building!',
    'loot': 'Ooh, shiny!'
  },
  'training': {
    'replay': 'Show me again',
    'progress': 'Training: {n} of {total} lessons done',
    'scrapWhy': 'Scrap buys upgrades for your weapons back at the Command Base.',
    'skip': 'Skip training'
  },
  'pause': {
    'title': 'PAUSED',
    'resume': 'Resume',
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
      'drag': 'Grab body'
    }
  },
  'prompt': {
    'salvage': 'Salvage',
    'strike': 'Takedown',
    'sabotage': 'Sabotage',
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
  }
}
