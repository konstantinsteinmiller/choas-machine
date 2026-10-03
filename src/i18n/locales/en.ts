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
  'hud': {
    'alert': 'Alert level',
    'strike': 'Strike',
    'decoy': 'Decoy',
    'weapons': 'Weapons',
    'ammo': 'Ammunition',
    'reloading': 'Reloading',
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
    'armor': 'Armor plating',
    'speed': 'Servo speed',
    'decoy': 'Decoy duration',
    'hook': 'Hook reach'
  },
  'trackVerb': {
    'speed': 'Level 1: a quieter sprint',
    'decoy': 'Level 1: one more decoy'
  },
  'workshop': {
    'max': 'Max',
    'buy': 'Upgrade {name}',
    'level': 'Level {n} of {max}'
  },
  'forge': {
    'tier': 'Tier {n}',
    'build': 'Build',
    'claim': 'Collect',
    'finish': 'Finish now',
    'busy': 'Forge busy',
    'top': 'Top tier'
  },
  'smithy': {
    'furnace': 'Furnace: hold the bellows to keep the heat in the band',
    'anvil': 'Anvil: strike when the ring meets the mark',
    'quench': 'Quench: dip it when it glows cherry red',
    'pump': 'Pump the bellows',
    'dip': 'Dip it',
    'stars': '{n} of 3 stars'
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
      'pause': 'Pause'
    }
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
