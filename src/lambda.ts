import { Handler, APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { WorkflowRunEvent } from '@octokit/webhooks-types'
import { GitHubContext } from './types'
import { run } from './run'
import { client, v2 } from '@datadog/datadog-api-client'

type IncomingEvent = WorkflowRunEvent // | WorkflowJobEvent

function createGithubContext(incomingEvent: IncomingEvent): GitHubContext {
  if ('workflow_run' in incomingEvent) {
    return {
      eventName: 'workflow_run',
      payload: incomingEvent,
      repo: {
        owner: incomingEvent.repository?.owner.login ?? 'untitled',
        repo: incomingEvent.repository?.name ?? 'untitled',
      },
    }
  } else throw new Error('Unsupported event type')
}

function urlencodedToObject(urlEncodedString: string): Record<string, string> {
  const searchParams = new URLSearchParams(urlEncodedString)

  const jsonObject: { [key: string]: string } = {}
  for (const [key, value] of searchParams.entries()) {
    jsonObject[key] = value
  }

  return jsonObject
}

async function logWebhookToDatadog(message: string, tags: string[] = []): Promise<void> {
  const configuration = client.createConfiguration({
    authMethods: {
      apiKeyAuth: process.env.DATADOG_API_KEY,
    },
  })
  if (process.env.DATADOG_SITE) {
    client.setServerVariables(configuration, {
      site: process.env.DATADOG_SITE,
    })
  }
  const apiInstance = new v2.LogsApi(configuration)

  const params: v2.LogsApiSubmitLogRequest = {
    body: [
      {
        ddsource: 'github',
        ddtags: tags.join(','),
        hostname: "aws-lambda",
        message: message,
        service: "github-actions",
      },
    ],
  }

  try {
    await apiInstance.submitLog(params)
    console.info(`Log sent to Datadog: ${message}`)
  } catch (error) {
    console.error(`Failed to send log to Datadog: ${error instanceof Error ? error.message : String(error)}`)
  }
}

export const handler: Handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  let statusCode: number
  let body: string = '{}'

  try {
    // Assuming "body" comes from API Gateway as a stringified JSON
    if (!('body' in event && typeof event.body === 'string')) throw new Error('No body field in event')
    const body = Buffer.from(event.body, 'base64').toString('utf-8')
    const parsedBody = JSON.parse(urlencodedToObject(body).payload) as IncomingEvent

    // construct GithubContext...
    const context = createGithubContext(parsedBody)
    // Log webhook
    if (process.env.FORWARD_WEBHOOK_TO_DATADOG && process.env.DATADOG_API_KEY) {
      await logWebhookToDatadog(JSON.stringify(context.payload))
    } else {
      console.debug(`Receive webhook: ${JSON.stringify(context.payload)}`)
    }

    if (process.env.GITHUB_TOKEN === undefined) throw new Error('GITHUB_TOKEN is not set')
    await run(context, {
      githubToken: process.env.GITHUB_TOKEN,
      githubTokenForRateLimitMetrics: process.env.GITHUB_TOKEN_RATE_LIMIT_METRICS ?? process.env.GITHUB_TOKEN,
      datadogApiKey: process.env.DATADOG_API_KEY,
      datadogSite: process.env.DATADOG_SITE,
      // tags in the form of `key:value` in a comma(,) separated string
      datadogTags: process.env.DATADOG_TAGS?.split(',') ?? [],
      collectJobMetrics: process.env.COLLECT_JOB_METRICS === 'true',
      collectStepMetrics: process.env.COLLECT_STEP_METRICS === 'true',
      preferDistributionWorkflowRunMetrics: process.env.PREFER_DISTRIBUTION_WORKFLOW_RUN_METRICS === 'true',
      preferDistributionJobMetrics: process.env.PREFER_DISTRIBUTION_JOB_METRICS === 'true',
      preferDistributionStepMetrics: process.env.PREFER_DISTRIBUTION_STEP_METRICS === 'true',
      sendPullRequestLabels: process.env.SEND_PULL_REQUEST_LABELS === 'true',
    })

    statusCode = 200
  } catch (err) {
    statusCode = 500
    body = JSON.stringify({ error: err instanceof Error ? err.message : 'An error occurred' })
    console.error(`event.body=${event.body}, error=${body}`)
  }

  // Return object required by API Gateway
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body,
  }
}
