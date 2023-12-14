import minimist from 'minimist';
import run from './src/runner.ts';

const args = {
  spec: '../ein-openapi/openapi/spec3.yaml',
  ...minimist(process.argv.slice(2)),
};

run(args);
