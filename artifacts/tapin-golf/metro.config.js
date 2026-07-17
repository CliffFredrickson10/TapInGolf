const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// With pnpm hoisted node_modules, we just need to tell Metro
// about the monorepo root for shared workspace packages
const monorepoRoot = path.resolve(__dirname, "../..");
config.watchFolders = [monorepoRoot];

module.exports = config;
