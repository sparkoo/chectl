/*********************************************************************
 * Copyright (c) 2020 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 **********************************************************************/

import { Command, flags } from '@oclif/command'
import { cli } from 'cli-ux'

import { CheServerLoginManager } from '../../api/che-login-manager'
import { ChectlContext } from '../../api/context'

export default class List extends Command {
  static description = 'Show all existing login sessions'

  static flags: flags.Input<any> = {
    help: flags.help({ char: 'h' }),
  }

  async run() {
    const { flags } = this.parse(List)
    await ChectlContext.init(flags, this)

    const loginManager = await CheServerLoginManager.getInstance()
    const logins = loginManager.getAllLogins()
    const currentLogin = loginManager.getCurrentLoginInfo()
    this.printLogins(logins, currentLogin)
  }

  private printLogins(allLogins: Map<string, string[]>, currentLogin: { cheApiEndpoint: string, username: string }): void {
    const currentLoginMarker = ' * '
    const indent = '   '

    let output: string
    if (allLogins.size > 0) {
      output = 'Available logins:\n'
      allLogins.forEach((serverLogins: string[], serverUrl: string) => {
        output += indent + serverUrl + '\n'
        for (const login of serverLogins) {
          output += (currentLogin.cheApiEndpoint === serverUrl && currentLogin.username === login) ? currentLoginMarker : indent
          output += indent + login + '\n'
        }
      })
    } else {
      output = 'There are no login sessions'
    }

    cli.info(output)
  }

}
