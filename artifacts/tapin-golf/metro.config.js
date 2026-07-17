const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");
const fs = require("fs");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// pnpm uses symlinks that Metro struggles with.
// Resolve the real paths for key packages so Metro can find them.
const appNodeModules = path.resolve(projectRoot, "node_modules");
const rootNodeModules = path.resolve(monorepoRoot, "node_modules");

config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [appNodeModules, rootNodeModules];

// Build extraNodeModules by resolving symlinks in the app's node_modules
// so Metro always gets real paths it can traverse
const extraNodeModules = {};
try {
  const entries = fs.readdirSync(appNodeModules);
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;
    const fullPath = path.join(appNodeModules, entry);
    try {
      const realPath = fs.realpathSync(fullPath);
      extraNodeModules[entry] = realPath;
    } catch {}
  }
  // Also resolve scoped packages (@expo/*, @react-navigation/*, etc.)
  for (const entry of entries) {
    if (!entry.startsWith("@")) continue;
    const scopeDir = path.join(appNodeModules, entry);
    try {
      const scopedEntries = fs.readdirSync(scopeDir);
      for (const pkg of scopedEntries) {
        const fullPath = path.join(scopeDir, pkg);
        try {
          const realPath = fs.realpathSync(fullPath);
          extraNodeModules[`${entry}/${pkg}`] = realPath;
        } catch {}
      }
    } catch {}
  }
} catch {}

config.resolver.extraNodeModules = extraNodeModules;

module.exports = config;
