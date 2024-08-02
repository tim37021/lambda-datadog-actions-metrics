import * as path from 'path'
import express from 'express'
import * as lambdaLocal from 'lambda-local'

const app = express()
const port = 3000

// make all the content type into text
app.use((req, res, next) => {
  // Check if we should attempt to parse the body
  let data = ''
  req.on('data', (chunk) => {
    data += chunk
  })
  req.on('end', () => {
    req.body = data
    next()
  })
})

app.use((req, res, next) => {
  // if content type is application/www-x-form-urlencoded, base64 encode it
  // reference https://aws.amazon.com/tw/blogs/aws/announcing-aws-lambda-function-urls-built-in-https-endpoints-for-single-function-microservices/
  if (!req.headers['content-type']?.startsWith('text/') && req.headers['content-type'] != 'application/json') {
    req.body = Buffer.from(req.body as string).toString('base64')
  }
  next()
})

// We will be listening to root (lambda function url feature)
app.post('/', (req, res) => {
  ;(async () => {
    type LambdaResponse = { statusCode: number; headers: typeof req.headers; body: string }

    const result = (await lambdaLocal.execute({
      lambdaPath: path.join(__dirname, 'lambda'),
      lambdaHandler: 'handler',
      envfile: path.join(process.cwd(), '.env.test'),
      timeoutMs: 10000,
      event: {
        headers: req.headers, // Pass on request headers
        body: req.body as string, // Pass on request body as string
      },
    })) as LambdaResponse

    // Respond to HTTP request
    res.status(result.statusCode).set(result.headers).end(result.body)
  })().catch((err) => console.log(err))
})

app.use((req, res) => {
  console.log(`Unhandled url [${req.method}]${req.url}`)
  res.status(404).send('Sorry, we cannot find that!')
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`)
})
