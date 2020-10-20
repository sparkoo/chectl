/*********************************************************************
 * Copyright (c) 2019 Red Hat, Inc.
 *
 * This program and the accompanying materials are made
 * available under the terms of the Eclipse Public License 2.0
 * which is available at https://www.eclipse.org/legal/epl-2.0/
 *
 * SPDX-License-Identifier: EPL-2.0
 **********************************************************************/
import { Command } from '@oclif/command'
import * as Listr from 'listr'

import { CheHelper } from '../api/che'
import { CheApiClient } from '../api/che-api-client'
import { KubeHelper } from '../api/kube'
import { OpenShiftHelper } from '../api/openshift'
import { VersionHelper } from '../api/version'
import { DOC_LINK, DOC_LINK_OBTAIN_ACCESS_TOKEN, DOC_LINK_OBTAIN_ACCESS_TOKEN_OAUTH, DOC_LINK_RELEASE_NOTES } from '../constants'

import { KubeTasks } from './kube'

/**
 * Holds tasks to work with Eclipse Che component.
 */
export class CheTasks {
  kube: KubeHelper
  kubeTasks: KubeTasks
  oc = new OpenShiftHelper()
  che: CheHelper

  cheNamespace: string

  cheAccessToken: string
  cheSelector = 'app=che,component=che'
  cheDeploymentName: string

  keycloakDeploymentName = 'keycloak'
  keycloakSelector = 'app=che,component=keycloak'

  postgresDeploymentName = 'postgres'
  postgresSelector = 'app=che,component=postgres'

  devfileRegistryDeploymentName = 'devfile-registry'
  devfileRegistrySelector = 'app=che,component=devfile-registry'

  pluginRegistryDeploymentName = 'plugin-registry'
  pluginRegistrySelector = 'app=che,component=plugin-registry'

  cheOperatorSelector = 'app=che-operator'

  cheConsoleLinkName = 'che'

  constructor(flags: any) {
    this.kube = new KubeHelper(flags)
    this.kubeTasks = new KubeTasks(flags)
    this.che = new CheHelper(flags)

    this.cheAccessToken = flags['access-token']

    this.cheNamespace = flags.chenamespace
    this.cheDeploymentName = flags['deployment-name']
  }

  /**
   * Returns tasks list that waits until every Eclipse Che component will be started.
   *
   * Note that Eclipse Che components statuses should be already set in context.
   *
   * @see che.checkIfCheIsInstalledTasks
   */
  waitDeployedChe(flags: any, command: Command): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: 'PostgreSQL pod bootstrap',
        skip: () => !flags.multiuser,
        enabled: ctx => ctx.isPostgresDeployed && !ctx.isPostgresReady,
        task: () => this.kubeTasks.podStartTasks(command, this.postgresSelector, this.cheNamespace)
      },
      {
        title: 'Keycloak pod bootstrap',
        skip: () => !flags.multiuser,
        enabled: ctx => ctx.isKeycloakDeployed && !ctx.isKeycloakReady,
        task: () => this.kubeTasks.podStartTasks(command, this.keycloakSelector, this.cheNamespace)
      },
      {
        title: 'Devfile registry pod bootstrap',
        enabled: ctx => ctx.isDevfileRegistryDeployed && !ctx.isDevfileRegistryReady,
        task: () => this.kubeTasks.podStartTasks(command, this.devfileRegistrySelector, this.cheNamespace)
      },
      {
        title: 'Plugin registry pod bootstrap',
        enabled: ctx => ctx.isPluginRegistryDeployed && !ctx.isPluginRegistryReady,
        task: () => this.kubeTasks.podStartTasks(command, this.pluginRegistrySelector, this.cheNamespace)
      },
      {
        title: 'Eclipse Che pod bootstrap',
        enabled: ctx => !ctx.isCheReady,
        task: () => this.kubeTasks.podStartTasks(command, this.cheSelector, this.cheNamespace)
      },
      ...this.checkEclipseCheStatus()
    ]
  }

  /**
   * Returns list of tasks that checks if Eclipse Che is already installed.
   *
   * After executing the following properties are set in context:
   * is[Component]Deployed, is[Component]Stopped, is[Component]Ready
   * where component is one the: Che, Keycloak, Postgres, PluginRegistry, DevfileRegistry
   */
  checkIfCheIsInstalledTasks(_flags: any, command: Command): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: `Verify if Eclipse Che is deployed into namespace \"${this.cheNamespace}\"`,
        task: async (ctx: any, task: any) => {
          if (await this.kube.deploymentExist(this.cheDeploymentName, this.cheNamespace)) {
            // helm chart and Eclipse Che operator use a deployment
            ctx.isCheDeployed = true
            ctx.isCheReady = await this.kube.deploymentReady(this.cheDeploymentName, this.cheNamespace)
            if (!ctx.isCheReady) {
              ctx.isCheStopped = await this.kube.deploymentStopped(this.cheDeploymentName, this.cheNamespace)
            }

            ctx.isKeycloakDeployed = await this.kube.deploymentExist(this.keycloakDeploymentName, this.cheNamespace)
            if (ctx.isKeycloakDeployed) {
              ctx.isKeycloakReady = await this.kube.deploymentReady(this.keycloakDeploymentName, this.cheNamespace)
              if (!ctx.isKeycloakReady) {
                ctx.isKeycloakStopped = await this.kube.deploymentStopped(this.keycloakDeploymentName, this.cheNamespace)
              }
            }

            ctx.isPostgresDeployed = await this.kube.deploymentExist(this.postgresDeploymentName, this.cheNamespace)
            if (ctx.isPostgresDeployed) {
              ctx.isPostgresReady = await this.kube.deploymentReady(this.postgresDeploymentName, this.cheNamespace)
              if (!ctx.isPostgresReady) {
                ctx.isPostgresStopped = await this.kube.deploymentStopped(this.postgresDeploymentName, this.cheNamespace)
              }
            }

            ctx.isDevfileRegistryDeployed = await this.kube.deploymentExist(this.devfileRegistryDeploymentName, this.cheNamespace)
            if (ctx.isDevfileRegistryDeployed) {
              ctx.isDevfileRegistryReady = await this.kube.deploymentReady(this.devfileRegistryDeploymentName, this.cheNamespace)
              if (!ctx.isDevfileRegistryReady) {
                ctx.isDevfileRegistryStopped = await this.kube.deploymentStopped(this.devfileRegistryDeploymentName, this.cheNamespace)
              }
            }

            ctx.isPluginRegistryDeployed = await this.kube.deploymentExist(this.pluginRegistryDeploymentName, this.cheNamespace)
            if (ctx.isPluginRegistryDeployed) {
              ctx.isPluginRegistryReady = await this.kube.deploymentReady(this.pluginRegistryDeploymentName, this.cheNamespace)
              if (!ctx.isPluginRegistryReady) {
                ctx.isPluginRegistryStopped = await this.kube.deploymentStopped(this.pluginRegistryDeploymentName, this.cheNamespace)
              }
            }
          }

          if (!ctx.isCheDeployed) {
            task.title = `${task.title}...it is not`
          } else {
            return new Listr([
              {
                enabled: () => ctx.isCheDeployed,
                title: `Found ${ctx.isCheStopped ? 'stopped' : 'running'} Eclipse Che deployment`,
                task: () => { }
              },
              {
                enabled: () => ctx.isPostgresDeployed,
                title: `Found ${ctx.isPostgresStopped ? 'stopped' : 'running'} postgres deployment`,
                task: () => { }
              },
              {
                enabled: () => ctx.isKeycloakDeployed,
                title: `Found ${ctx.isKeycloakStopped ? 'stopped' : 'running'} keycloak deployment`,
                task: () => { }
              },
              {
                enabled: () => ctx.isPluginRegistryDeployed,
                title: `Found ${ctx.isPluginRegistryStopped ? 'stopped' : 'running'} plugin registry deployment`,
                task: () => { }
              },
              {
                enabled: () => ctx.isDevfileRegistryDeployed,
                title: `Found ${ctx.isDevfileRegistryStopped ? 'stopped' : 'running'} devfile registry deployment`,
                task: () => { }
              }
            ])
          }
        }
      },
      {
        title: 'Check Eclipse Che server status',
        enabled: (ctx: any) => ctx.isCheDeployed && ctx.isCheReady,
        task: async (ctx: any, task: any) => {
          let cheURL = ''
          try {
            cheURL = await this.che.cheURL(this.cheNamespace)
            const cheApi = CheApiClient.getInstance(cheURL + '/api')
            const status = await cheApi.getCheServerStatus()
            ctx.isAuthEnabled = await cheApi.isAuthenticationEnabled()
            const auth = ctx.isAuthEnabled ? '(auth enabled)' : '(auth disabled)'
            task.title = `${task.title}...${status} ${auth}`
          } catch (error) {
            command.error(`E_CHECK_CHE_STATUS_FAIL - Failed to check Eclipse Che status (URL: ${cheURL}). ${error.message}`)
          }
        }
      }
    ]
  }

  /**
   * Returns tasks list which scale down all Eclipse Che components which are deployed.
   * It requires {@link this#checkIfCheIsInstalledTasks} to be executed before.
   *
   * @see [CheTasks](#checkIfCheIsInstalledTasks)
   */
  scaleCheUpTasks(_command: Command): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: 'Scaling up Eclipse Che Deployments',
        enabled: (ctx: any) => ctx.isCheDeployed,
        task: async (ctx: any, task: any) => {
          if (ctx.isPostgresDeployed) {
            await this.kube.scaleDeployment(this.postgresDeploymentName, this.cheNamespace, 1)
          }
          if (ctx.isKeycloakDeployed) {
            await this.kube.scaleDeployment(this.keycloakDeploymentName, this.cheNamespace, 1)
          }
          if (ctx.isPluginRegistryDeployed) {
            await this.kube.scaleDeployment(this.pluginRegistryDeploymentName, this.cheNamespace, 1)
          }
          if (ctx.isDevfileRegistryDeployed) {
            await this.kube.scaleDeployment(this.devfileRegistryDeploymentName, this.cheNamespace, 1)
          }
          await this.kube.scaleDeployment(this.cheDeploymentName, this.cheNamespace, 1)
          task.title = `${task.title}...done.`
        }
      },
      {
        title: `Eclipse Che is already running in namespace \"${this.cheNamespace}\".`,
        enabled: (ctx: any) => (ctx.isCheDeployed && ctx.isCheAvailable),
        task: async (ctx: any, task: any) => {
          ctx.cheDeploymentExist = true
          ctx.cheIsAlreadyRunning = true
          ctx.cheURL = await this.che.cheURL(this.cheNamespace)
          task.title = await `${task.title}...it's URL is ${ctx.cheURL}`
        }
      }
    ]
  }

  /**
   * Returns tasks list which scale down all Eclipse Che components which are deployed.
   * It requires {@link this#checkIfCheIsInstalledTasks} to be executed before.
   *
   * @see [CheTasks](#checkIfCheIsInstalledTasks)
   */
  scaleCheDownTasks(command: Command): ReadonlyArray<Listr.ListrTask> {
    return [{
      title: 'Stop Eclipse Che server and wait until it\'s ready to shutdown',
      enabled: (ctx: any) => !ctx.isCheStopped,
      task: async (task: any) => {
        try {
          const cheURL = await this.che.cheURL(this.cheNamespace)
          const cheApi = CheApiClient.getInstance(cheURL + '/api')
          await cheApi.startCheServerShutdown(this.cheAccessToken)
          await cheApi.waitUntilCheServerReadyToShutdown()
          task.title = `${task.title}...done`
        } catch (error) {
          command.error(`E_SHUTDOWN_CHE_SERVER_FAIL - Failed to shutdown Eclipse Che server. ${error.message}`)
        }
      }
    },
    {
      title: `Scale \"${this.cheDeploymentName}\" deployment to zero`,
      enabled: (ctx: any) => !ctx.isCheStopped,
      task: async (_ctx: any, task: any) => {
        try {
          await this.kube.scaleDeployment(this.cheDeploymentName, this.cheNamespace, 0)
          task.title = await `${task.title}...done`
        } catch (error) {
          command.error(`E_SCALE_DEPLOY_FAIL - Failed to scale deployment. ${error.message}`)
        }
      }
    },
    {
      title: 'Scale \"keycloak\" deployment to zero',
      enabled: (ctx: any) => ctx.isKeycloakDeployed && !ctx.isKeycloakStopped,
      task: async (_ctx: any, task: any) => {
        try {
          await this.kube.scaleDeployment(this.keycloakDeploymentName, this.cheNamespace, 0)
          task.title = await `${task.title}...done`
        } catch (error) {
          command.error(`E_SCALE_DEPLOY_FAIL - Failed to scale keycloak deployment. ${error.message}`)
        }
      }
    },
    {
      title: 'Scale \"postgres\" deployment to zero',
      enabled: (ctx: any) => ctx.isPostgresDeployed && !ctx.isPostgresStopped,
      task: async (_ctx: any, task: any) => {
        try {
          await this.kube.scaleDeployment(this.postgresDeploymentName, this.cheNamespace, 0)
          task.title = await `${task.title}...done`
        } catch (error) {
          command.error(`E_SCALE_DEPLOY_FAIL - Failed to scale postgres deployment. ${error.message}`)
        }
      }
    },
    {
      title: 'Scale \"devfile registry\" deployment to zero',
      enabled: (ctx: any) => ctx.isDevfileRegistryDeployed && !ctx.isDevfileRegistryStopped,
      task: async (_ctx: any, task: any) => {
        try {
          await this.kube.scaleDeployment(this.devfileRegistryDeploymentName, this.cheNamespace, 0)
          task.title = await `${task.title}...done`
        } catch (error) {
          command.error(`E_SCALE_DEPLOY_FAIL - Failed to scale devfile-registry deployment. ${error.message}`)
        }
      }
    },
    {
      title: 'Scale \"plugin registry\" deployment to zero',
      enabled: (ctx: any) => ctx.isPluginRegistryDeployed && !ctx.isPluginRegistryStopped,
      task: async (_ctx: any, task: any) => {
        try {
          await this.kube.scaleDeployment(this.pluginRegistryDeploymentName, this.cheNamespace, 0)
          task.title = await `${task.title}...done`
        } catch (error) {
          command.error(`E_SCALE_DEPLOY_FAIL - Failed to scale plugin-registry deployment. ${error.message}`)
        }
      }
    }]
  }

  /**
   * Returns tasks which remove all Eclipse Che related resources.
   */
  deleteTasks(flags: any): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: 'Delete all deployments',
        task: async (_ctx: any, task: any) => {
          await this.kube.deleteAllDeployments(flags.chenamespace)
          task.title = await `${task.title}...OK`
        }
      },
      {
        title: 'Delete all services',
        task: async (_ctx: any, task: any) => {
          await this.kube.deleteAllServices(flags.chenamespace)
          task.title = await `${task.title}...OK`
        }
      },
      {
        title: 'Delete all ingresses',
        enabled: (ctx: any) => !ctx.isOpenShift,
        task: async (_ctx: any, task: any) => {
          await this.kube.deleteAllIngresses(flags.chenamespace)
          task.title = await `${task.title}...OK`
        }
      },
      {
        title: 'Delete all routes',
        enabled: (ctx: any) => ctx.isOpenShift,
        task: async (_ctx: any, task: any) => {
          await this.oc.deleteAllRoutes(flags.chenamespace)
          task.title = await `${task.title}...OK`
        }
      },
      {
        title: 'Delete configmaps for Eclipse Che server and operator',
        task: async (_ctx: any, task: any) => {
          if (await this.kube.getConfigMap('che', flags.chenamespace)) {
            await this.kube.deleteConfigMap('che', flags.chenamespace)
          }
          if (await this.kube.getConfigMap('che-operator', flags.chenamespace)) {
            await this.kube.deleteConfigMap('che-operator', flags.chenamespace)
          }
          task.title = await `${task.title}...OK`
        }
      },
      {
        title: 'Delete rolebindings che, che-workspace-exec and che-workspace-view',
        task: async (_ctx: any, task: any) => {
          if (await this.kube.roleBindingExist('che', flags.chenamespace)) {
            await this.kube.deleteRoleBinding('che', flags.chenamespace)
          }
          if (await this.kube.roleBindingExist('che-operator', flags.chenamespace)) {
            await this.kube.deleteRoleBinding('che-operator', flags.chenamespace)
          }
          if (await this.kube.roleBindingExist('che-workspace-exec', flags.chenamespace)) {
            await this.kube.deleteRoleBinding('che-workspace-exec', flags.chenamespace)
          }
          if (await this.kube.roleBindingExist('che-workspace-view', flags.chenamespace)) {
            await this.kube.deleteRoleBinding('che-workspace-view', flags.chenamespace)
          }
          task.title = await `${task.title}...OK`
        }
      },
      {
        title: 'Delete service accounts che, che-workspace',
        task: async (_ctx: any, task: any) => {
          if (await this.kube.serviceAccountExist('che', flags.chenamespace)) {
            await this.kube.deleteServiceAccount('che', flags.chenamespace)
          }
          if (await this.kube.roleBindingExist('che-workspace', flags.chenamespace)) {
            await this.kube.deleteServiceAccount('che-workspace', flags.chenamespace)
          }
          task.title = await `${task.title}...OK`
        }
      },
      {
        title: 'Delete PVC postgres-data and che-data-volume',
        task: async (_ctx: any, task: any) => {
          if (await this.kube.persistentVolumeClaimExist('postgres-data', flags.chenamespace)) {
            await this.kube.deletePersistentVolumeClaim('postgres-data', flags.chenamespace)
          }
          if (await this.kube.persistentVolumeClaimExist('che-data-volume', flags.chenamespace)) {
            await this.kube.deletePersistentVolumeClaim('che-data-volume', flags.chenamespace)
          }
          task.title = await `${task.title}...OK`
        }
      },
      {
        title: `Delete consoleLink ${this.cheConsoleLinkName}`,
        task: async (_ctx: any, task: any) => {
          const consoleLinkExists = await this.kube.consoleLinkExists(this.cheConsoleLinkName)
          const checlusters = await this.kube.getAllCheCluster()
          // Delete the consoleLink only in case if there no more checluster installed
          if (checlusters.length === 0 && consoleLinkExists) {
            await this.kube.deleteConsoleLink(this.cheConsoleLinkName)
          }
          task.title = `${task.title}...OK`
        }
      }]
  }

  /**
   * Returns tasks which wait until pods are deleted.
   */
  waitPodsDeletedTasks(): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: 'Wait until Eclipse Che pod is deleted',
        task: async (_ctx: any, task: any) => {
          await this.kube.waitUntilPodIsDeleted(this.cheSelector, this.cheNamespace)
          task.title = `${task.title}...done.`
        }
      },
      {
        title: 'Wait until Keycloak pod is deleted',
        task: async (_ctx: any, task: any) => {
          await this.kube.waitUntilPodIsDeleted(this.keycloakSelector, this.cheNamespace)
          task.title = `${task.title}...done.`
        }
      },
      {
        title: 'Wait until Postgres pod is deleted',
        task: async (_ctx: any, task: any) => {
          await this.kube.waitUntilPodIsDeleted(this.postgresSelector, this.cheNamespace)
          task.title = `${task.title}...done.`
        }
      },
      {
        title: 'Wait until Devfile registry pod is deleted',
        task: async (_ctx: any, task: any) => {
          await this.kube.waitUntilPodIsDeleted(this.devfileRegistrySelector, this.cheNamespace)
          task.title = `${task.title}...done.`
        }
      },
      {
        title: 'Wait until Plugin registry pod is deleted',
        task: async (_ctx: any, task: any) => {
          await this.kube.waitUntilPodIsDeleted(this.pluginRegistrySelector, this.cheNamespace)
          task.title = `${task.title}...done.`
        }
      }
    ]
  }

  deleteNamespace(flags: any): ReadonlyArray<Listr.ListrTask> {
    return [{
      title: `Delete namespace ${flags.chenamespace}`,
      task: async (task: any) => {
        const namespaceExist = await this.kube.namespaceExist(flags.chenamespace)
        if (namespaceExist) {
          await this.kube.deleteNamespace(flags.chenamespace)
        }
        task.title = `${task.title}...OK`
      }
    }]
  }

  verifyCheNamespaceExistsTask(flags: any, command: Command): ReadonlyArray<Listr.ListrTask> {
    return [{
      title: `Verify if namespace '${flags.chenamespace}' exists`,
      task: async () => {
        if (!await this.che.cheNamespaceExist(flags.chenamespace)) {
          command.error(`E_BAD_NS - Namespace does not exist.\nThe Kubernetes Namespace "${flags.chenamespace}" doesn't exist.`, { code: 'EBADNS' })
        }
      }
    }]
  }

  /**
   * Verifies if workspace running and puts #V1Pod into a context.
   */
  verifyWorkspaceRunTask(flags: any, command: Command): ReadonlyArray<Listr.ListrTask> {
    return [{
      title: 'Verify if the workspaces is running',
      task: async (ctx: any) => {
        ctx.pod = await this.che.getWorkspacePodName(flags.chenamespace!, flags.workspace).catch(e => command.error(e.message))
      }
    }]
  }

  /**
   * Return tasks to collect Eclipse Che logs.
   */
  serverLogsTasks(flags: any, follow: boolean): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: `${follow ? 'Start following' : 'Read'} Operator logs`,
        skip: () => flags.installer !== 'operator' && flags.installer !== 'olm',
        task: async (ctx: any, task: any) => {
          await this.che.readPodLog(flags.chenamespace, this.cheOperatorSelector, ctx.directory, follow)
          task.title = `${task.title}...done`
        }
      },
      {
        title: `${follow ? 'Start following' : 'Read'} Eclipse Che logs`,
        task: async (ctx: any, task: any) => {
          await this.che.readPodLog(flags.chenamespace, this.cheSelector, ctx.directory, follow)
          task.title = await `${task.title}...done`
        }
      },
      {
        title: `${follow ? 'Start following' : 'Read'} Postgres logs`,
        task: async (ctx: any, task: any) => {
          await this.che.readPodLog(flags.chenamespace, this.postgresSelector, ctx.directory, follow)
          task.title = await `${task.title}...done`
        }
      },
      {
        title: `${follow ? 'Start following' : 'Read'} Keycloak logs`,
        task: async (ctx: any, task: any) => {
          await this.che.readPodLog(flags.chenamespace, this.keycloakSelector, ctx.directory, follow)
          task.title = await `${task.title}...done`
        }
      },
      {
        title: `${follow ? 'Start following' : 'Read'} Plugin registry logs`,
        task: async (ctx: any, task: any) => {
          await this.che.readPodLog(flags.chenamespace, this.pluginRegistrySelector, ctx.directory, follow)
          task.title = await `${task.title}...done`
        }
      },
      {
        title: `${follow ? 'Start following' : 'Read'} Devfile registry logs`,
        task: async (ctx: any, task: any) => {
          await this.che.readPodLog(flags.chenamespace, this.devfileRegistrySelector, ctx.directory, follow)
          task.title = await `${task.title}...done`
        }
      }
    ]
  }

  namespaceEventsTask(namespace: string, command: Command, follow: boolean): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: `${follow ? 'Start following' : 'Read'} namespace events`,
        task: async (ctx: any, task: any) => {
          await this.che.readNamespaceEvents(namespace, ctx.directory, follow).catch(e => command.error(e.message))
          task.title = await `${task.title}...done`
        }
      }
    ]
  }

  debugTask(flags: any): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: 'Find Eclipse Che server pod',
        task: async (ctx: any, task: any) => {
          const chePods = await this.kube.listNamespacedPod(flags.chenamespace, undefined, this.cheSelector)
          if (chePods.items.length === 0) {
            throw new Error(`Eclipse Che server pod not found in the namespace '${flags.chenamespace}'`)
          }
          ctx.podName = chePods.items[0].metadata!.name!
          task.title = `${task.title}...done`
        }
      },
      {
        title: 'Check if debug mode is enabled',
        task: async (task: any) => {
          const configMap = await this.kube.getConfigMap('che', flags.chenamespace)
          if (!configMap || configMap.data!.CHE_DEBUG_SERVER !== 'true') {
            throw new Error('Eclipse Che server should be redeployed with \'--debug\' flag')
          }

          task.title = `${task.title}...done`
        }
      },
      {
        title: `Forward port '${flags['debug-port']}'`,
        task: async (ctx: any, task: any) => {
          await this.kube.portForward(ctx.podName, flags.chenamespace, flags['debug-port'])
          task.title = `${task.title}...done`
        }
      }
    ]
  }

  preparePostInstallationOutput(flags: any): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: 'Prepare post installation output',
        task: async (ctx: any, task: any) => {
          const messages: string[] = []

          const version = await VersionHelper.getCheVersion(flags)
          messages.push(`Eclipse Che ${version.trim()} has been successfully deployed.`)
          messages.push(`Documentation             : ${DOC_LINK}`)
          if (DOC_LINK_RELEASE_NOTES) {
            messages.push(`Release Notes           : ${DOC_LINK_RELEASE_NOTES}`)
          }
          messages.push('')

          const cheUrl = await this.che.cheURL(flags.chenamespace)
          messages.push(`Users Dashboard           : ${cheUrl}`)
          const cheCluster = await this.kube.getCheCluster(flags.chenamespace)
          if (cheCluster && cheCluster.spec.auth && cheCluster.spec.auth.updateAdminPassword) {
            messages.push('Admin user login          : "admin:admin". NOTE: must change after first login.')
          }
          messages.push('')

          const cheConfigMap = await this.kube.getConfigMap('che', flags.chenamespace)
          if (cheConfigMap && cheConfigMap.data) {
            if (cheConfigMap.data.CHE_WORKSPACE_PLUGIN__REGISTRY__URL) {
              messages.push(`Plug-in Registry          : ${cheConfigMap.data.CHE_WORKSPACE_PLUGIN__REGISTRY__URL}`)
            }
            if (cheConfigMap.data.CHE_WORKSPACE_DEVFILE__REGISTRY__URL) {
              messages.push(`Devfile Registry          : ${cheConfigMap.data.CHE_WORKSPACE_DEVFILE__REGISTRY__URL}`)
            }
            messages.push('')

            if (cheConfigMap.data.CHE_KEYCLOAK_AUTH__SERVER__URL) {
              messages.push(`Identity Provider URL     : ${cheConfigMap.data.CHE_KEYCLOAK_AUTH__SERVER__URL}`)
            }
            if (ctx.identityProviderUsername && ctx.identityProviderPassword) {
              messages.push(`Identity Provider login   : "${ctx.identityProviderUsername}:${ctx.identityProviderPassword}".`)
            }
            messages.push('')
          }
          ctx.highlightedMessages = messages.concat(ctx.highlightedMessages)
          task.title = `${task.title}...done`
        }
      }
    ]
  }

  checkEclipseCheStatus(): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: 'Eclipse Che status check',
        task: async ctx => {
          const cheApi = CheApiClient.getInstance(ctx.cheURL + '/api')
          return cheApi.isCheServerReady()
        }
      }
    ]
  }

  checkIsAuthenticationEnabled(): ReadonlyArray<Listr.ListrTask> {
    return [
      {
        title: 'Checking authentication',
        task: async (ctx: any, task: any) => {
          const cheApi = CheApiClient.getInstance(ctx.cheURL + '/api')
          ctx.isAuthEnabled = await cheApi.isAuthenticationEnabled()
          if (ctx.isAuthEnabled && !this.cheAccessToken) {
            throw new Error('E_AUTH_REQUIRED - Eclipse Che authentication is enabled and an access token is needed to be provided (flag --access-token). ' +
              `See the documentation how to obtain token: ${DOC_LINK_OBTAIN_ACCESS_TOKEN} and ${DOC_LINK_OBTAIN_ACCESS_TOKEN_OAUTH}.`)
          }
          task.title = `${task.title}... ${ctx.isAuthEnabled ? '(auth enabled)' : '(auth disabled)'}`
        }
      }
    ]
  }
}
