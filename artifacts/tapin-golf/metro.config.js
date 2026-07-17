const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// pnpm uses symlinks — tell Metro to watch the monorepo root
// and resolve from the .pnpm hoisted node_modules
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];
// Follow symlinks so pnpm's linked packages resolve correctly
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
