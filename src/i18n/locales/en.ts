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
    'loot': 'Strip the salvage'
  },
  'defeat': {
    'title': 'Mech down',
    'retry': 'Try again',
    'kept': 'Tech Scrap salvaged'
  },
  'base': {
    'deploy': 'Deploy',
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
    'decoy': 'Decoy duration'
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
  'pause': {
    'title': 'PAUSED',
    'resume': 'Resume',
    'controls': 'Controls'
  },
  'options': {
    'killCams': 'Kill-cam',
    'sensitivity': 'Look sensitivity',
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
