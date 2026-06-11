// Servidor estático simples para o frontend
// Uso: node serve.js [porta]
// Variável de ambiente: API_URL (padrão: http://localhost:3334)
const http = require('http')
const fs   = require('fs')
const path = require('path')

const PORT    = parseInt(process.env.PORT || process.argv[2]) || 8080
const API_URL = process.env.API_URL || 'http://localhost:3334'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.ico':  'image/x-icon',
}

http.createServer((req, res) => {
  const file = path.join(__dirname, req.url === '/' ? 'index.html' : req.url)
  const ext  = path.extname(file)

  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback: serve index.html para qualquer rota desconhecida
      serveIndex(res)
      return
    }

    if (ext === '.html') {
      // Injeta window.API_URL antes de servir o HTML
      const html = data.toString().replace(
        'const API = (window.API_URL || \'http://localhost:3334\')',
        `const API = '${API_URL}'`
      )
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' })
    res.end(data)
  })
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Frontend disponível em http://localhost:${PORT}`)
  console.log(`API_URL configurada: ${API_URL}`)
})

function serveIndex(res) {
  fs.readFile(path.join(__dirname, 'index.html'), (e, d) => {
    const html = d.toString().replace(
      'const API = (window.API_URL || \'http://localhost:3334\')',
      `const API = '${API_URL}'`
    )
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  })
}
