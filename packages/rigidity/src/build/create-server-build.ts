import {
  BuildResult,
} from 'esbuild';
import {
  PAGES_PATH,
  API_PATH,
  BUILD_PATH,
  PUBLIC_PATH,
  BUILD_OUTPUT,
  ASSETS_URL,
  PUBLIC_URL,
  CUSTOM_ROOT,
} from '../constants';
import {
  BuildOptions,
} from '../types';
import { outputFile, removeFile } from '../utils/fs';
import {
  getArtifactBaseDirectory,
} from './get-artifact-directory';
import getPages from './get-pages';
import {
  getAPIImports,
  getPageImports,
} from './imports';
import {
  getCustomRoot,
} from './inject-page';
import {
  getAPIOptions,
  getPagesOptions,
} from './options';
import runESBuild from './run-esbuild';

export default async function createServerBuild(
  options: BuildOptions,
): Promise<BuildResult> {
  const path = await import('path');

  const environment = options.env ?? 'production';
  const pagesDirectory = options.directories?.pages ?? PAGES_PATH;
  const apiDirectory = options.directories?.api ?? API_PATH;
  const buildDirectory = options.directories?.build ?? BUILD_PATH;
  const publicDirectory = options.directories?.public ?? PUBLIC_PATH;

  const pages = await getPages(pagesDirectory);
  const apis = await getPages(apiDirectory);

  const outputDirectory = path.join(
    buildDirectory,
    BUILD_OUTPUT.server.output,
  );

  await removeFile(outputDirectory);

  const artifactDirectory = await getArtifactBaseDirectory(
    options,
    'server',
  );

  // Create import header
  const lines = [
    'import { createServerPage } from "rigidity";',
    ...await getAPIImports(
      apiDirectory,
      artifactDirectory,
      apis,
    ),
    ...await getPageImports(
      pagesDirectory,
      artifactDirectory,
      pages,
      true,
    ),
  ];

  const customRoot = await getCustomRoot(
    artifactDirectory,
    lines,
    options.paths?.root ?? CUSTOM_ROOT,
  );

  lines.push(options.adapter.generateScript(`{
    ssrMode: ${JSON.stringify(options.ssrMode ?? 'sync')},
    version: ${JSON.stringify(Date.now())},
    buildDir: ${JSON.stringify(path.join(buildDirectory, BUILD_OUTPUT.client.output))},
    publicDir: ${JSON.stringify(publicDirectory)},
    apiDir: ${JSON.stringify(apiDirectory)},
    enableStaticFileServing: ${JSON.stringify(options.adapter.enableStaticFileServing)},
    cdn: ${options.paths?.cdn ? JSON.stringify(options.paths.cdn) : 'undefined'},
    assetsUrl: ${JSON.stringify(options.paths?.assets ?? ASSETS_URL)},
    publicUrl: ${JSON.stringify(options.paths?.public ?? PUBLIC_URL)},
    root: ${customRoot ?? 'undefined'},
    pages: ${await getPagesOptions(pages)},
    endpoints: ${await getAPIOptions(apis)},
  }`));

  const artifact = path.join(artifactDirectory, 'index.tsx');

  await outputFile(
    artifact,
    lines.join('\n'),
  );

  const result = await runESBuild(
    {
      content: artifact,
      sourceDirectory: artifactDirectory,
      outputDirectory,
    },
    { isDev: environment !== 'production', isServer: true },
    options,
  );

  await removeFile(artifact);
  await removeFile(artifactDirectory);

  return result;
}
