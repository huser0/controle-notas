const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, "..", "shared");

const config = getDefaultConfig(projectRoot);

// A lógica comum com o app web mora fora de mobile/, então o Metro precisa
// vigiar essa pasta e saber resolver o alias "shared" (o equivalente no Vite
// está em ../vite.config.js).
config.watchFolders = [sharedRoot];
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  shared: sharedRoot,
};
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];

module.exports = config;
