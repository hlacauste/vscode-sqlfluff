import AbortController from "node-abort-controller";
import fetch, { Response } from "node-fetch";
import { AbortSignal } from "node-fetch/externals";

import Configuration from "./configuration";
import Utilities from "./utilities";

export interface DbtInterfaceRunResult {
  column_names: string[];
  rows: any[][];
  raw_sql: string;
  compiled_sql: string;
}

export interface DbtInterfaceCompileResult {
  result: string;
}

export interface DbtInterfaceResetResult {
  result: string;
}

export enum DbtInterfaceFullReparse {
  True = "true",
  False = "false",
}

export enum DbtInterfaceErrorCode {
  FailedToReachServer = -1,
  CompileSqlFailure = 1,
  ExecuteSqlFailure = 2,
  ProjectParseFailure = 3,
  UnlintableUnfixable = 0,
}

export interface DbtInterfaceErrorContainer {
  error: {
    code: DbtInterfaceErrorCode;
    message: string;
    data: { [index: string]: string | number };
  };
}

const projectNotRegisteredError: DbtInterfaceErrorContainer = {
  error: {
    code: DbtInterfaceErrorCode.CompileSqlFailure,
    message: "Sqlfluff currently unavailable. Check that your project does not contain compilation errors.",
    data: {
      error: "",
    },
  },
};

export class DbtInterface {
  private sql: string | undefined;
  private sql_path: string | undefined;
  private extra_config_path: string;

  constructor(sql: string | undefined, sql_path: string | undefined, extra_config_path: string) {
    this.sql = sql;
    this.sql_path = sql_path;
    this.extra_config_path = extra_config_path;
  }

  public getLintURL(): string {
    let url = `http://${Configuration.dbtInterfaceHost()}:${Configuration.dbtInterfacePort()}/lint?sql_path=${
      this.sql_path
    }`;
    if (this.sql !== undefined) {
      url = `http://${Configuration.dbtInterfaceHost()}:${Configuration.dbtInterfacePort()}/lint?`;
    }

    if (this.extra_config_path) {
      url += `&extra_config_path=${this.extra_config_path}`;
    }

    return url;
  }

  public getFormatURL(): string {
    // This endpoint is equivalent to "sqlfluff format". The behavior is
    // _similar_ to "sqlfluff fix", but it applies a different set of rules.
    // https://docs.sqlfluff.com/en/stable/cli.html#sqlfluff-format
    let url = `http://${Configuration.dbtInterfaceHost()}:${Configuration.dbtInterfacePort()}/format?sql_path=${
      this.sql_path
    }`;
    if (this.sql !== undefined) {
      url = `http://${Configuration.dbtInterfaceHost()}:${Configuration.dbtInterfacePort()}/format?`;
    }

    if (this.extra_config_path) {
      url += `&extra_config_path=${this.extra_config_path}`;
    }

    return url;
  }

  public async healthCheck(): Promise<any> {
    const abortController = new AbortController();
    const timeoutHandler = setTimeout(() => {
      abortController.abort();
    }, 1000);
    try {
      const response = await fetch(
        `http://${Configuration.dbtInterfaceHost()}:${Configuration.dbtInterfacePort()}/health`,
        {
          method: "GET",
          signal: abortController.signal as AbortSignal,
        }
      );
      if (response.status === 200) {
        return true;
      } else {
        return false;
      }
    } catch (e) {
      return false;
    } finally {
      clearTimeout(timeoutHandler);
    }
  }

  public async lint<T>(timeout = 25000) {
    const failedToReachServerError: DbtInterfaceErrorContainer = {
      error: {
        code: DbtInterfaceErrorCode.FailedToReachServer,
        message: "Query failed to reach dbt sync server.",
        data: {
          error: `Is the server listening on the http://${Configuration.dbtInterfaceHost()}:${Configuration.dbtInterfacePort()} address?`,
        },
      },
    };

    if (!(await this.healthCheck())) {
      Utilities.appendHyphenatedLine();
      Utilities.outputChannel.appendLine("Unhealthy dbt project:");
      Utilities.appendHyphenatedLine();
      return projectNotRegisteredError;
    }

    const abortController = new AbortController();
    const timeoutHandler = setTimeout(() => {
      abortController.abort();
    }, timeout);
    let response: Response;

    try {
      response = await fetch(encodeURI(this.getLintURL()), {
        method: "POST",
        signal: abortController.signal as AbortSignal,
        body: this.sql,
      });
    } catch (error) {
      Utilities.appendHyphenatedLine();
      Utilities.outputChannel.appendLine("Raw dbt-core-interface /lint error response:");
      Utilities.appendHyphenatedLine();
      Utilities.outputChannel.appendLine(error as string);
      Utilities.appendHyphenatedLine();

      clearTimeout(timeoutHandler);
      return failedToReachServerError;
    }
    clearTimeout(timeoutHandler);
    return (await response.json()) as T;
  }

  public async format<T>(timeout = 25000) {
    const failedToReachServerError: DbtInterfaceErrorContainer = {
      error: {
        code: DbtInterfaceErrorCode.FailedToReachServer,
        message: "Query failed to reach dbt sync server.",
        data: {
          error: `Is the server listening on the http://${Configuration.dbtInterfaceHost()}:${Configuration.dbtInterfacePort()} address?`,
        },
      },
    };

    if (!(await this.healthCheck())) {
      Utilities.appendHyphenatedLine();
      Utilities.outputChannel.appendLine("Unhealthy dbt project:");
      Utilities.appendHyphenatedLine();
      return projectNotRegisteredError;
    }

    const abortController = new AbortController();
    const timeoutHandler = setTimeout(() => {
      abortController.abort();
    }, timeout);
    let response: Response;
    try {
      response = await fetch(encodeURI(this.getFormatURL()), {
        method: "POST",
        signal: abortController.signal as AbortSignal,
        body: this.sql,
      });
    } catch (error) {
      Utilities.appendHyphenatedLine();
      Utilities.outputChannel.appendLine("Raw dbt-core-interface /format error response:");
      Utilities.appendHyphenatedLine();
      Utilities.outputChannel.appendLine(error as string);
      Utilities.appendHyphenatedLine();

      clearTimeout(timeoutHandler);
      return failedToReachServerError;
    }
    clearTimeout(timeoutHandler);
    return (await response.json()) as T;
  }
}
