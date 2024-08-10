import { client, v2 } from '@datadog/datadog-api-client'

const sendLogToDatadog = async (message: string, tags: string[] = []): Promise<void> => {
  const configuration = client.createConfiguration({
    authMethods: {
      apiKeyAuth: process.env.DATADOG_API_KEY,
    },
  })
  const apiInstance = new v2.LogsApi(configuration)

  const params: v2.LogsApiSubmitLogRequest = {
    body: [
      {
        ddsource: 'github',
        ddtags: tags.join(','),
        message: message,
        service: 'github-actions',
      },
    ],
  }

  try {
    await apiInstance.submitLog(params)
    console.log(`Log sent to Datadog: ${message}`)
  } catch (error) {
    console.error(`Failed to send log to Datadog: ${error instanceof Error ? error.message : String(error)}`)
  }
}

sendLogToDatadog(JSON.stringify({ test: 'yoyo' }))
