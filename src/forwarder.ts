import * as core from '@actions/core'
import { client, v2 } from '@datadog/datadog-api-client'
import { HttpLibrary } from './http'

type Inputs = {
  datadogApiKey?: string
  datadogSite?: string
  datadogTags: string[]
}

type WebhookForwarder = {
  send(payload: string): Promise<void>
}

export class DatadogForwarder implements WebhookForwarder {
  constructor(
    private readonly apiInstance: v2.LogsApi,
    private readonly tags: string[],
  ) {}

  async send(payload: string) {
    const params: v2.LogsApiSubmitLogRequest = {
      body: [
        {
          ddsource: 'github',
          ddtags: this.tags.join(','),
          hostname: 'i-012345678',
          message: payload,
          service: 'lambda',
        },
      ],
      contentEncoding: 'deflate',
    }

    await this.apiInstance.submitLog(params)
  }
}

export class NullForwarder implements WebhookForwarder {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async send(payload: string) {}
}

export const createWebhookForwarder = (inputs: Inputs): WebhookForwarder => {
  if (inputs.datadogApiKey === undefined) {
    return new NullForwarder()
  }

  const configuration = client.createConfiguration({
    authMethods: {
      apiKeyAuth: inputs.datadogApiKey,
    },
    httpApi: createHttpLibraryIfHttpsProxy(),
  })
  if (inputs.datadogSite) {
    client.setServerVariables(configuration, {
      site: inputs.datadogSite,
    })
  }
  return new DatadogForwarder(new v2.LogsApi(configuration), inputs.datadogTags)
}

const createHttpLibraryIfHttpsProxy = () => {
  const httpsProxy = process.env['https_proxy']
  if (httpsProxy) {
    core.info(`Using https_proxy: ${httpsProxy}`)
    return new HttpLibrary()
  }
}
