import * as Logger from 'bunyan';
import { ChildProcess } from 'child_process';
import * as fs from 'fs';
import { defaults, includes, pick, isEmpty, isArray } from 'lodash';
import * as shell from 'shelljs';
import { ExecOptions } from 'shelljs';

interface ErrorCallback<T> { (err?: T): void; }
interface AsyncResultCallback<T, E> { (err?: E, result?: T): void; }

export interface DefaultOptions {
  silent: Boolean;
  async: Boolean;
  branch: string;
  commit: string;
  prettifyResult: Function;
}

export interface Options extends Partial<DefaultOptions> {
  githubUrl: string;
  pathToRepo: string;
}

export interface CloneOptions extends Partial<DefaultOptions> {
  absolutePathToRepos: string;
  relativePathToRepo: string;
  githubUrl: string;
}

export interface ShowOptions extends Options {
  relativeFilePath: string;
}

export interface DiffOptions extends Options {
  commitFrom: string;
  commitTo: string;
}

export interface AmountLinesOptions extends Partial<DefaultOptions> {
  pathToRepo?: string;
  files?: string[];
}

export interface DirOptions extends Partial<DefaultOptions> {
  pathToDir: string;
}

// keyof ExecOptions
const defaultShellOptions = ['silent', 'async'];

export const defaultOptions: DefaultOptions = {
  silent: true,
  async: true,
  branch: 'master',
  commit: 'HEAD',
  prettifyResult: (value: string) => value
};

class ReposService {
  private _logger: Logger;

  public constructor(logger: Logger) {
    this._logger = logger;
  }

  public set logger(logger: Logger) {
    this._logger = logger;
  }

  public silentClone(options: CloneOptions, callback: ErrorCallback<string>): ChildProcess {
    const { absolutePathToRepos, githubUrl, relativePathToRepo, branch } = defaults(options, defaultOptions);
    const command = `git -C ${absolutePathToRepos} clone ${githubUrl} ${relativePathToRepo} -b ${branch}`;

    return this.runShellJsCommand(command, options, (error: string) => {
      const isNotEmptyDirectory = includes(error, 'already exists and is not an empty directory');

      if (isNotEmptyDirectory) {
        return callback();
      }

      return callback(error);
    });
  }

  public clone(options: Options, callback: ErrorCallback<string>): ChildProcess {
    const { githubUrl, pathToRepo, branch } = defaults(options, defaultOptions);
    const command = this.wrapGitCommand(pathToRepo,`clone ${githubUrl} ${pathToRepo} -b ${branch}`);

    return this.runShellJsCommand(command, options, callback);
  }

  public checkoutToBranch(options: Options, callback: ErrorCallback<string>): ChildProcess {
    const { pathToRepo, branch } = defaults(options, defaultOptions);
    const command = this.wrapGitCommand(pathToRepo, `checkout ${branch}`);

    return this.runShellJsCommand(command, options, callback);
  }

  public checkoutToCommit(options: Options, callback: ErrorCallback<string>): ChildProcess {
    const { pathToRepo, commit } = defaults(options, defaultOptions);
    const command = this.wrapGitCommand(pathToRepo, `checkout ${commit}`);

    return this.runShellJsCommand(command, options, callback);
  }

  public fetch(options: Options, callback: ErrorCallback<string>): ChildProcess {
    const { pathToRepo } = defaults(options, defaultOptions);
    const command = this.wrapGitCommand(pathToRepo, `fetch --all --prune`);

    return this.runShellJsCommand(command, options, callback);
  }

  public reset(options: Options, callback: ErrorCallback<string>): ChildProcess {
    const { pathToRepo, branch } = defaults(options, defaultOptions);
    const command = this.wrapGitCommand(pathToRepo, `reset --hard origin/${branch}`);

    return this.runShellJsCommand(command, options, callback);
  }

  public pull(options: Options, callback: ErrorCallback<string>): ChildProcess {
    const { pathToRepo, branch } = defaults(options, defaultOptions);
    const command = this.wrapGitCommand(pathToRepo, `pull origin ${branch}`);

    return this.runShellJsCommand(command, options, callback);
  }

  public clean(options: Options, callback: ErrorCallback<string>): ChildProcess {
    const { pathToRepo } = defaults(options, defaultOptions);
    const command = this.wrapGitCommand(pathToRepo, `clean -f -d`);

    return this.runShellJsCommand(command, options, callback);
  }

  public log(options: Options, callback: ErrorCallback<string>): ChildProcess {
    const { pathToRepo } = defaults(options, defaultOptions);
    const command = this.wrapGitCommand(pathToRepo, `log --pretty=format:%h%n%ad%n%s%n%n`);

    return this.runShellJsCommand(command, options, callback);
  }

  public show(options: ShowOptions, callback: ErrorCallback<string>): ChildProcess {
    const { pathToRepo, commit, relativeFilePath } = defaults(options, defaultOptions);
    const command = this.wrapGitCommand(pathToRepo, `show ${commit}:${relativeFilePath}`);

    return this.runShellJsCommand(command, options, callback);
  }

  public diff(options: DiffOptions, callback: ErrorCallback<string>): ChildProcess {
    const { pathToRepo, commitFrom, commitTo } = defaults(options, defaultOptions);
    const command = this.wrapGitCommand(pathToRepo, `diff ${commitFrom} ${commitTo} --name-status --no-renames | grep ".csv$"`);

    return this.runShellJsCommand(command, options, callback);
  }

  public getAmountLines(options: AmountLinesOptions, callback: ErrorCallback<string>): ChildProcess {
    const { pathToRepo, files } = defaults(options, defaultOptions);

    let command = `wc -l ${pathToRepo}/*.csv | grep "total$"`;

    if (isArray(files)) {
      command = isEmpty(files) ? 'echo 0' : `wc -l "${files}" | grep "total$"`;
    }

    return this.runShellJsCommand(command, options, callback);
  }

  public checkSshKey(execOptions: ExecOptions, callback: ErrorCallback<string>): ChildProcess {
    const command = `ssh -T git@github.com`;

    return shell.exec(command, execOptions, (code: number, stdout: string, stderr: string) => {
      if (code > 1) {
        const error = `[code=${code}]\n${stderr}\nPlease, follow the detailed instruction 'https://github.com/Gapminder/waffle-server-import-cli#ssh-key' for continue working with CLI tool.`;

        return callback(error);
      }

      return callback();
    });
  }

  public makeDirForce(options: DirOptions, onDirMade: ErrorCallback<string>): void {
    return fs.exists(options.pathToDir, (exists: boolean) => {
      if (!exists) {
        shell.mkdir('-p', options.pathToDir);

        return onDirMade(shell.error());
      }

      return onDirMade();
    });
  }

  public removeDirForce(options: DirOptions, onDirRemoved: ErrorCallback<string>): void {
    return fs.exists(options.pathToDir, (exists: boolean) => {
      if (!exists) {
        shell.rm('-rf', options.pathToDir + '/*');

        return onDirRemoved(shell.error());
      }

      return onDirRemoved(`Directory '${options.pathToDir}' is not exist!`);
    });
  }

  private runShellJsCommand(command: string, options: Options | CloneOptions | AmountLinesOptions, callback: AsyncResultCallback<any, string>): ChildProcess {
    const {prettifyResult} = options;
    const execOptions: ExecOptions = this.getExecOptions(options);

    return shell.exec(command, execOptions, (code: number, stdout: string, stderr: string) => {
      if (code !== 0) {
        this._logger.error({ obj: { code, command, options, stdout, stderr, defaultOptions } });

        return callback(stderr);
      }

      return callback(null, prettifyResult(stdout));
    });
  }

  private wrapGitCommand(pathToRepo: string, command: string): string {
    return `git --git-dir=${pathToRepo}/.git --work-tree=${pathToRepo} ${command}`;
  }

  private getExecOptions(options: Options | CloneOptions | AmountLinesOptions): ExecOptions {
    return pick(options, defaultShellOptions);
  }
}

const defaultLogger = Logger.createLogger({ name: 'defaultLogger' });
const reposService = new ReposService(defaultLogger);

export default reposService;
