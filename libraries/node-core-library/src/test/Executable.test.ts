// Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
// See LICENSE in the project root for license information.

import * as os from 'os';
import * as path from 'path';
import * as child_process from 'child_process';

import { Executable, IExecutableSpawnSyncOptions } from '../Executable';
import { FileSystem } from '../FileSystem';
import { Text } from '../Text';

// Use src/test/test-data instead of lib/test/test-data
const executableFolder: string = path.join(__dirname, '..', '..', 'src', 'test', 'test-data', 'executable');
expect(FileSystem.exists(executableFolder)).toEqual(true);

const environment: NodeJS.ProcessEnv = {
  PATH: [
    path.join(executableFolder, 'skipped'),
    path.join(executableFolder, 'success'),
    path.join(executableFolder, 'fail'),
    path.dirname(process.execPath) // the folder where node.exe can be found
  ].join(path.delimiter),

  PATHEXT: '.COM;.EXE;.BAT;.CMD;.VBS',

  TEST_VAR: '123'
};

const options: IExecutableSpawnSyncOptions = {
  environment: environment,
  currentWorkingDirectory: executableFolder,
  stdio: 'pipe'
};

test('Executable.tryResolve()', () => {
  const resolved: string | undefined = Executable.tryResolve('npm-binary-wrapper', options);
  expect(resolved).toBeDefined();
  const resolvedRelative: string = Text.replaceAll(path.relative(executableFolder, resolved!),
    '\\', '/');

  if (os.platform() === 'win32') {
    // On Windows, we should find npm-binary-wrapper.cmd instead of npm-binary-wrapper
    expect(resolvedRelative).toEqual('success/npm-binary-wrapper.cmd');
  } else {
    expect(resolvedRelative).toEqual('success/npm-binary-wrapper');
  }

  // We should not find the "non-executable-extension.ps1" at all, because its file extension
  // is not executable
  expect(Executable.tryResolve('non-executable-extension.ps1', options)).toBeUndefined();
});

function executeNpmBinaryWrapper(args: string[]): string[] {
  const result: child_process.SpawnSyncReturns<string>
  = Executable.spawnSync('npm-binary-wrapper', args, options);
  expect(result.error).toBeUndefined();

  expect(result.stderr).toBeDefined();
  expect(result.stderr.toString()).toEqual('');

  expect(result.stdout).toBeDefined();
  const outputLines: string[] = result.stdout.toString().split(/[\r\n]+/g).map(x => x.trim());

  let lineIndex: number = 0;
  if (os.platform() === 'win32') {
    expect(outputLines[lineIndex++]).toEqual('Executing npm-binary-wrapper.cmd with args:');
    // console.log('npm-binary-wrapper.cmd ARGS: ' + outputLines[lineIndex]);
    ++lineIndex;
  }

  expect(outputLines[lineIndex++]).toEqual('Executing javascript-file.js with args:');

  const stringifiedArgv: string = outputLines[lineIndex++];
  expect(stringifiedArgv.substr(0, 2)).toEqual('[\"');

  const argv: string[] = JSON.parse(stringifiedArgv);
  // Discard the first two array entries whose path is nondeterministic
  argv.shift();  // the path to node.exe
  argv.shift();  // the path to javascript-file.js

  return argv;
}

test('Executable.spawnSync("npm-binary-wrapper") simple', () => {
  const args: string[] = ['arg1', 'arg2', 'arg3'];
  expect(executeNpmBinaryWrapper(args)).toEqual(args);
});

test('Executable.spawnSync("npm-binary-wrapper") edge cases 1', () => {
  // Characters that confuse the CreateProcess() WIN32 API's encoding
  const args: string[] = ['', '/', ' \t ', '"a', 'b"', '"c"', '\\"\\d', '!', '!TEST_VAR!'];
  expect(executeNpmBinaryWrapper(args)).toEqual(args);
});

test('Executable.spawnSync("npm-binary-wrapper") edge cases 2', () => {
  // All ASCII punctuation
  const args: string[] = [
    // Characters that are impossible to escape for cmd.exe:
    // %^&|<>  newline
    '~!@#$*()_+`={}[]\:";\'?,./',
    '~!@#$*()_+`={}[]\:";\'?,./'
  ];
  expect(executeNpmBinaryWrapper(args)).toEqual(args);
});

test('Executable.spawnSync("npm-binary-wrapper") edge cases 2', () => {
  // All ASCII punctuation
  const args: string[] = [
    // Characters that are impossible to escape for cmd.exe:
    // %^&|<>  newline
    '~!@#$*()_+`={}[]\:";\'?,./',
    '~!@#$*()_+`={}[]\:";\'?,./'
  ];
  expect(executeNpmBinaryWrapper(args)).toEqual(args);
});

test('Executable.spawnSync("npm-binary-wrapper") bad characters', () => {
  expect(() => { executeNpmBinaryWrapper(['abc%123']); })
    .toThrowError('The command line argument "abc%123" contains a special character "%"'
      + ' that cannot be escaped for the Windows shell');
  expect(() => { executeNpmBinaryWrapper(['abc<>123']); })
    .toThrowError('The command line argument "abc<>123" contains a special character "<"'
      + ' that cannot be escaped for the Windows shell');
});

test('Executable.spawnSync("javascript-file.js")', () => {
  // Since cmd.exe isn't involved, all these crazy characters pass through without any trouble
  const args: string[] = [
    '', '/', ' \t ', '"a', 'b"', '"c"', '\\"\\d', '!', '!TEST_VAR!',
    '%TEST_VAR%',
    '%^&|<>',
    '~!@#$*()_+`={}[]\:";\'?,./',
    ' \n ',
    ' \r\n '
  ];

  const result: child_process.SpawnSyncReturns<string>
  = Executable.spawnSync('javascript-file.js', args, options);
  expect(result.error).toBeUndefined();

  expect(result.stderr).toBeDefined();
  expect(result.stderr.toString()).toEqual('');

  expect(result.stdout).toBeDefined();
  const outputLines: string[] = result.stdout.toString().split(/[\r\n]+/g).map(x => x.trim());

  expect(outputLines[0]).toEqual('Executing javascript-file.js with args:');

  const stringifiedArgv: string = outputLines[1];
  expect(stringifiedArgv.substr(0, 2)).toEqual('[\"');

  const argv: string[] = JSON.parse(stringifiedArgv);
  // Discard the first two array entries whose path is nondeterministic
  argv.shift();  // the path to node.exe
  argv.shift();  // the path to javascript-file.js

  expect(argv).toEqual(args);
});
