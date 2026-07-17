const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// pnpm hoists packages to the monorepo root node_modules/.pnpm
// Tell Metro to watch and resolve from both locations
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Disable symlink following — it causes Metro to resolve into .pnpm
// store paths where relative imports between packages break
config.resolver.unstable_enableSymlinks = false;

module.exports = config;
