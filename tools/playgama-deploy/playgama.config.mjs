// Settings for `pnpm deploy:playgama` (tools/playgama-deploy/deploy.mjs).

export default {
  /** The game as the cabinet names it. Used to find the game when
   *  `applicationId` is empty; titles are not unique, so a match must be exact
   *  and single. */
  title: 'Chaos Machine',

  /** The cabinet's id for the game (`list_applications`). Filled in, the title
   *  lookup is skipped. */
  applicationId: '',

  /** Archive name in the cabinet: `<archivePrefix>-<version>`. */
  archivePrefix: 'chaos-machine',

  /** The package.json script that produces the upload. Here it builds, packs
   *  and runs the Playgama/Playables release gates (tools/playgama-release). */
  buildScript: 'build:playgama',

  /** The zip that script leaves behind. */
  zip: 'dist-playgama/chaos-machine-playgama.zip',

  /** Set `{ dist: '<build folder>' }` when the build script does NOT pack a
   *  zip itself: the pipeline then zips that folder into `zip` with its own
   *  PKZIP writer (never shell `tar`, see lib/zip.mjs). */
  pack: null,

  /** Standing answers for the QA Tool's guided certification, applied by
   *  whoever drives it (see the playgama-deploy-qa skill). These two are the
   *  developer's own declarations, never inferred from the build. */
  qaAnswers: {
    'Is this game built entirely with generative AI?': 'No',
    'Does the game contain sensitive content?': 'No'
  }
}
