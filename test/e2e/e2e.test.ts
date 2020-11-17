/*********************************************************************
 * Copyright (c) 2020 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 **********************************************************************/

// tslint:disable: no-console

import { expect, test } from '@oclif/test'
import * as execa from 'execa'

import { isKubernetesPlatformFamily } from '../../src/util'

import { E2eHelper } from './util'

const helper = new E2eHelper()
jest.setTimeout(1000000)

const binChectl = `${process.cwd()}/bin/run`

const PLATFORM = process.env.PLATFORM || ''
const INSTALLER = process.env.INSTALLER || ''

const PLATFORM_OPENSHIFT = 'openshift'
const PLATFORM_CRC = 'crc'
const PLATFORM_MINISHIFT = 'minishift'
const PLATFORM_MINIKUBE = 'minikube'

const INSTALLER_OPERATOR = 'operator'
const INSTALLER_HELM = 'helm'

function getDeployCommand(): string {
  let command: string
  switch (PLATFORM) {
    case PLATFORM_OPENSHIFT:
    case PLATFORM_CRC:
    case PLATFORM_MINISHIFT:
      if (INSTALLER !== INSTALLER_OPERATOR) {
        throw new Error(`Unknown installer ${INSTALLER}`)
      }
      command = `${binChectl} server:deploy --platform=${PLATFORM} --installer=${INSTALLER} --che-operator-cr-patch-yaml=test/e2e/resources/cr-patch.yaml`
      break
    case PLATFORM_MINIKUBE:
      if (!(INSTALLER === INSTALLER_OPERATOR || INSTALLER === INSTALLER_HELM)) {
        throw new Error(`Unknown installer ${INSTALLER}`)
      }
      const patchOption = INSTALLER === INSTALLER_HELM ? '--helm-patch-yaml=test/e2e/resources/helm-patch.yaml' : '--che-operator-cr-patch-yaml=test/e2e/resources/cr-patch.yaml'
      command = `${binChectl} server:deploy --platform=${PLATFORM} --installer=${INSTALLER} ${patchOption} --multiuser --skip-cluster-availability-check`
      break
    default:
      throw new Error(`Unknown platform: ${PLATFORM}`)
  }
  return command
}

describe('Eclipse Che deploy deployemnt', () => {
  describe(`server:deploy using ${INSTALLER} installer and self signed certificates`, () => {
    it(`server:deploy using ${INSTALLER} installer and self signed certificates`, async () => {
      const command = getDeployCommand()
      console.log(command)
      const { exitCode, stdout, stderr } = await execa(command, { shell: true })

      expect(exitCode).equal(0)
      console.log(stdout)

      if (exitCode !== 0) {
        console.log(stderr)
      }

      // sleep after deploying
      await execa('sleep 15s', { shell: true })
    })
  })
})

describe('Eclipse Che server authentication', () => {
  it('Should login in to Che server with username and password', async () => {
    let cheApiEndpoint: string
    if (isKubernetesPlatformFamily(PLATFORM)) {
      const ingressName = INSTALLER === INSTALLER_HELM ? 'che-ingress' : 'che'
      cheApiEndpoint = await helper.K8SHostname(ingressName) + '/api'
    } else {
      cheApiEndpoint = await helper.OCHostname('che') + '/api'
    }

    const command = `${binChectl} auth:login`
    const args = [cheApiEndpoint, '-u', 'admin', '-p', 'admin']

    const { exitCode, stdout, stderr } = await execa(command, args, { timeout: 30000, shell: true })

    expect(exitCode).equal(0)
    expect(stdout).to.contain('Successfully logged into')
    console.log(stdout)

    if (exitCode !== 0) {
      console.log(stderr)
    }
  })

  it('Should show current login session', async () => {
    const command = `${binChectl} auth:get`

    const { exitCode, stdout, stderr } = await execa(command, { timeout: 30000, shell: true })

    expect(exitCode).equal(0)
    expect(stdout).to.contain('admin')
    console.log(stdout)

    if (exitCode !== 0) {
      console.log(stderr)
    }
  })
})

describe('Export CA certificate', () => {
  it('Export CA certificate', async () => {
    const command = `${binChectl} cacert:export`

    const { exitCode, stdout, stderr } = await execa(command, { timeout: 30000, shell: true })

    expect(exitCode).equal(0)
    console.log(stdout)

    if (exitCode !== 0) {
      console.log(stderr)
    }
  })
})

describe('Workspace creation, list, start, inject, delete. Support stop and delete commands for Eclipse Che server', () => {
  describe('Create workspace', () => {
    it('Testing workspace:create command', async () => {
      console.log('>>> Testing workspace:create command')

      const { exitCode, stdout, stderr, } = await execa(binChectl, ['workspace:create', '--devfile=test/e2e/resources/devfile-example.yaml'], { timeout: 30000, shell: true })

      console.log(`stdout: ${stdout}`)
      console.log(`stderr: ${stderr}`)
      expect(exitCode).equal(0)
    })
  })

  describe('Start Workspace', () => {
    it('Testing workspace:start command', async () => {
      console.log('>>> Testing workspace:start command')

      const workspaceId = await helper.getWorkspaceId()
      const { exitCode, stdout, stderr, } = await execa(binChectl, ['workspace:start', workspaceId], { timeout: 30000, shell: true })

      console.log(`stdout: ${stdout}`)
      console.log(`stderr: ${stderr}`)
      expect(exitCode).equal(0)

      // Sleep time to wait to workspace to be running
      await helper.sleep(200000)
      const workspaceStatus = await helper.getWorkspaceStatus()
      expect(workspaceStatus).to.contain('RUNNING')
    })
  })

  describe('Inject kubeconfig to workspaces', () => {
    it('Testing workspace:inject command', async () => {
      console.log('>>> Testing workspace:inject command')

      const { exitCode, stdout, stderr } = await execa(binChectl, ['workspace:inject', '--kubeconfig'], { timeout: 30000, shell: true })

      console.log(`stdout: ${stdout}`)
      console.log(`stderr: ${stderr}`)
      expect(exitCode).equal(0)
    })
  })

  describe('List Workspace', () => {
    test
      .stdout({ print: true })
      .stderr({ print: true })
      .command(['workspace:list'])
      .it('List workspaces')
  })

  describe('Get Eclipse Che server status', () => {
    test
      .stdout({ print: true })
      .stderr({ print: true })
      .command(['server:status'])
      .it('Get Che Server status')
  })

  describe('Stop Workspace', () => {
    it('Testing workspace:stop command', async () => {
      console.log('>>> Testing workspace:stop command')

      const workspaceId = await helper.getWorkspaceId()
      const { exitCode, stdout, stderr } = await execa(binChectl, ['workspace:stop', workspaceId], { timeout: 30000, shell: true })

      console.log(`stdout: ${stdout}`)
      console.log(`stderr: ${stderr}`)
      expect(exitCode).equal(0)

      const workspaceStatus = await helper.getWorkspaceStatus()
      // The status could be STOPPING or STOPPED
      expect(workspaceStatus).to.contain('STOP')
    })
  })

  describe('Delete Workspace', () => {
    it('Testing workspace:delete command', async () => {
      console.log('>>> Testing workspace:delete command')

      const workspaceId = await helper.getWorkspaceId()
      const { exitCode, stdout, stderr } = await execa(binChectl, ['workspace:delete', workspaceId], { timeout: 30000, shell: true })

      console.log(`stdout: ${stdout}`)
      console.log(`stderr: ${stderr}`)
      expect(exitCode).equal(0)
    })
  })

  describe('Stop Eclipse Che server', () => {
    it('server:stop command coverage', async () => {
      console.log('>>> Testing server:stop command')

      const { exitCode, stdout, stderr } = await execa(binChectl, ['server:stop'], { shell: true })

      console.log(`stdout: ${stdout}`)
      console.log(`stderr: ${stderr}`)
      expect(exitCode).equal(0)
    })
  })

  describe('Delete Eclipse Che server', () => {
    test
      .stdout({ print: true })
      .stderr({ print: true })
      .command(['server:delete', '--yes', '--delete-namespace'])
      .exit(0)
      .it(`deletes Eclipse Che resources on ${PLATFORM} platform successfully`)
  })
})