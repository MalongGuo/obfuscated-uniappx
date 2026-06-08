export {
  ARTIFACT_JSON,
  ARTIFACT_JSON_BASENAMES,
  OBFUSCATION_MODES,
  artifactFilenameCandidates,
  isArtifactJsonFile,
  modeArtifactName,
} from './artifact-names.js';

export {
  guessSourceProjectName,
  resolveArtifactProjectRoot,
  resolveArtifactFile,
} from './artifact-resolve.js';

export { writeArtifactJson } from './artifact-write.js';

export { writeCloneArtifacts, writeResourcesMapArtifact } from '../path/artifacts.js';
export { writeSymbolsMapArtifact, writeStringsMapArtifact, symbolMapArtifactNames } from '../code/artifacts.js';
