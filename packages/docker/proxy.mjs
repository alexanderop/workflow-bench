import http from 'node:http'
import net from 'node:net'

const allowed = new Set([
  'chatgpt.com:443',
  'api.openai.com:443',
  'auth.openai.com:443',
])
const server = http.createServer((_, res) => {
  res.writeHead(403)
  res.end('HTTPS inference only')
})
server.on('connect', (request, client, head) => {
  if (!allowed.has(request.url)) {
    client.end('HTTP/1.1 403 Forbidden\r\n\r\n')
    return
  }
  const upstream = net.connect(443, request.url.slice(0, -4), () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head.length) upstream.write(head)
    client.pipe(upstream)
    upstream.pipe(client)
  })
  upstream.on('error', () => client.destroy())
  client.on('error', () => upstream.destroy())
  client.on('close', () => upstream.destroy())
  upstream.setTimeout(120000, () => upstream.destroy())
})
server.listen(3128, '0.0.0.0')
