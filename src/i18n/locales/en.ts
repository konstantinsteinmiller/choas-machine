// English source bundle. Single source of truth for translation keys — every
// new player-facing string gets a key here first; the per-language files in
// this folder mirror the shape. Vite ships each non-English locale as its own
// lazy chunk (see `src/i18n/index.ts`).
export default {
  'gameName': 'Chaos Machine',
  'close': 'Close',
  'ok': 'Ok',
  'rewards': 'REWARDS',
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
    'unmute': 'Unmute'
  },
  'hud': {
    'alert': 'Alert level',
    'crouch': 'Crouch',
    'stand': 'Stand up',
    'cancel': 'Lower weapon',
    'capture': 'Click to continue'
  },
  'pause': {
    'title': 'PAUSED',
    'resume': 'Resume',
    'controls': 'Controls'
  },
  'options': {
    'killCams': 'Kill-cam',
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
      'crouch': 'Crouch',
      'act': 'Strike / use',
      'decoy': 'Deploy decoy',
      'reload': 'Reload',
      'weapon1': 'Sniper rifle',
      'weapon2': 'Mini-gun',
      'weapon3': 'Rocket launcher',
      'cycle': 'Next weapon'
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
