// Global (self-hosted) configuration of the infrabay Renovate.
//
// renovatebot/github-action reads this file through `configurationFile: config.js`. Only
// admin-side options belong here. How a repository is updated is set in that repository's
// renovate.json, which normally extends the org preset in default.json ("local>infrabay/renovate").
// The token is not set here: the workflow mints a GitHub App installation token and the action
// passes it to Renovate as RENOVATE_TOKEN.
module.exports = {
  platform: 'github',

  // Process every repository the App token can see. The workflow limits the token to an explicit
  // list and refuses to run if any of them is private, because the logs of this repository are
  // public. The filter keeps Renovate inside the org even if the token ever sees more.
  autodiscover: true,
  autodiscoverFilter: ['infrabay/*'],

  // A repository without a Renovate config file first gets an onboarding PR that adds a
  // renovate.json extending the org preset. Closing that PR without merging opts the repository out.
  onboarding: true,
  requireConfig: 'required',
  onboardingConfig: {
    $schema: 'https://docs.renovatebot.com/renovate-schema.json',
    extends: ['local>infrabay/renovate'],
  },

  // The default for every repository; a repository can still turn it off in its own config.
  dependencyDashboard: true,

  // postUpgradeTasks run only commands that fully match one of these patterns (matched after
  // templates are filled in). Exactly one command is allowed, with no arguments and no templates:
  // `go mod tidy`, which regenerates go.sum after a custom-manager bump of go.mod. Keep the anchors.
  allowedCommands: ['^go mod tidy$'],

  // The image default, written out because postUpgradeTasks.installTools depends on it. The
  // default (slim) image has no Go: a repository asks for it with
  // `postUpgradeTasks.installTools: { "golang": {} }`, and containerbase installs it before the
  // commands run. installTools is ignored with binarySource=global.
  binarySource: 'install',

  // Persisted between runs by the workflow (actions/cache). The workflow's "repoCache" input can
  // override this for one run (disabled/reset) through RENOVATE_REPOSITORY_CACHE.
  repositoryCache: 'enabled',

  // Identity. With a GitHub App token, Renovate commits through the GitHub API, so commits are
  // signed ("Verified") and GitHub sets their author to the App's bot user. 'auto' (the default)
  // already does this for App tokens; it is written out so the intent is visible.
  platformCommit: 'enabled',
  // Renovate detects username and gitAuthor from the token. Its docs advise against setting
  // gitAuthor when platform commits are on (GitHub ignores it). The detected values are:
  //   username:  'infrabay-renovate[bot]'
  //   gitAuthor: 'infrabay-renovate[bot] <336860805+infrabay-renovate[bot]@users.noreply.github.com>'
  // 336860805 is the bot user's ID: gh api 'users/infrabay-renovate[bot]' --jq .id
};
