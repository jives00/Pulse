const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

// When building via `subst E:`, __dirname resolves to E:\apps\mobile but
// npm symlinks in node_modules still point to C:\ absolute paths. Include
// the real C:\ workspace root so Metro can follow those symlinks.
const realWorkspaceRoot = 'C:\\Users\\jbrom\\SynologyDrive\\Development\\EverythingApp';

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot, realWorkspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
  path.resolve(realWorkspaceRoot, 'node_modules'),
];

module.exports = config;
