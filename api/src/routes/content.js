const { query } = require('../db')

const VALID_TYPES  = new Set(['lesson', 'quiz', 'exercise'])
const VALID_LEVELS = new Set(['A1', 'A2', 'B1', 'B2', 'C1', 'C2'])

function parseCSV(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  if (lines.length < 2) return { rows: [], errors: [] }

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const required = ['title', 'type', 'level', 'rule_number']
  const missing = required.filter(r => !headers.includes(r))
  if (missing.length) {
    return { rows: [], errors: [`Colunas obrigatórias faltando: ${missing.join(', ')}`] }
  }

  const rows = []
  const errors = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // CSV-safe split respecting quoted fields
    const cells = []
    let cur = '', inQuote = false
    for (let c = 0; c < line.length; c++) {
      if (line[c] === '"') { inQuote = !inQuote }
      else if (line[c] === ',' && !inQuote) { cells.push(cur); cur = '' }
      else { cur += line[c] }
    }
    cells.push(cur)

    const row = {}
    headers.forEach((h, idx) => { row[h] = (cells[idx] || '').trim() })

    const lineNum = i + 1
    const rowErrors = []

    if (!row.title || row.title.length > 200)  rowErrors.push('title inválido (1-200 chars)')
    if (!VALID_TYPES.has(row.type))             rowErrors.push(`type deve ser lesson|quiz|exercise (recebeu: "${row.type}")`)
    if (!VALID_LEVELS.has(row.level))           rowErrors.push(`level deve ser A1|A2|B1|B2|C1|C2 (recebeu: "${row.level}")`)
    const rn = parseInt(row.rule_number, 10)
    if (isNaN(rn) || rn < 1 || rn > 16)        rowErrors.push(`rule_number deve ser 1-16 (recebeu: "${row.rule_number}")`)

    if (rowErrors.length) {
      errors.push(`Linha ${lineNum}: ${rowErrors.join('; ')}`)
      continue
    }

    let body = {}
    if (row.body) {
      try { body = JSON.parse(row.body) } catch { body = { text: row.body } }
    }

    rows.push({
      title:         row.title,
      type:          row.type,
      level:         row.level,
      rule_number:   rn,
      body,
      points_reward: parseInt(row.points_reward, 10) || 10,
      order_index:   parseInt(row.order_index, 10)   || 0,
    })
  }

  return { rows, errors }
}

async function routes(fastify) {
  // GET /content?level=B1&rule=3&type=quiz
  fastify.get('/', { preHandler: [fastify.authenticate] }, async (request) => {
    const { level = null, rule = null, type = null } = request.query
    const { rows } = await query(
      `SELECT id, title, type, level, rule_number, body, points_reward, order_index, created_at
       FROM content
       WHERE ($1::varchar IS NULL OR level = $1)
         AND ($2::integer IS NULL OR rule_number = $2)
         AND ($3::varchar IS NULL OR type = $3)
       ORDER BY rule_number, order_index`,
      [level, rule ? parseInt(rule, 10) : null, type]
    )
    return rows
  })

  // GET /content/:id
  fastify.get('/:id', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    const { rows: [item] } = await query(
      'SELECT * FROM content WHERE id = $1',
      [request.params.id]
    )
    if (!item) return reply.code(404).send({ error: 'Content not found' })
    return item
  })

  // POST /content — requer professor
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.requireTeacher],
    schema: {
      body: {
        type: 'object',
        required: ['title', 'type', 'level', 'rule_number'],
        properties: {
          title:         { type: 'string', minLength: 1, maxLength: 200 },
          type:          { type: 'string', enum: ['lesson','quiz','exercise'] },
          level:         { type: 'string', enum: ['A1','A2','B1','B2','C1','C2'] },
          rule_number:   { type: 'integer', minimum: 1, maximum: 16 },
          body:          { type: 'object' },
          points_reward: { type: 'integer', minimum: 0 },
          order_index:   { type: 'integer', minimum: 0 },
        },
      },
    },
  }, async (request, reply) => {
    const { title, type, level, rule_number, body = {}, points_reward = 10, order_index = 0 } = request.body
    const { rows: [item] } = await query(
      `INSERT INTO content (title, type, level, rule_number, body, points_reward, order_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [title, type, level, rule_number, JSON.stringify(body), points_reward, order_index]
    )
    return reply.code(201).send(item)
  })

  // DELETE /content/:id — requer professor
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.requireTeacher],
  }, async (request, reply) => {
    const { rows: [item] } = await query(
      'DELETE FROM content WHERE id = $1 RETURNING id',
      [request.params.id]
    )
    if (!item) return reply.code(404).send({ error: 'Content not found' })
    return reply.code(204).send()
  })

  // POST /content/import-csv — requer professor
  fastify.post('/import-csv', {
    preHandler: [fastify.authenticate, fastify.requireTeacher],
  }, async (request, reply) => {
    const data = await request.file()
    if (!data) return reply.code(400).send({ error: 'Nenhum arquivo enviado' })

    const ext = data.filename?.split('.').pop()?.toLowerCase()
    if (ext !== 'csv') return reply.code(400).send({ error: 'Apenas arquivos .csv são aceitos' })

    const chunks = []
    for await (const chunk of data.file) chunks.push(chunk)
    const text = Buffer.concat(chunks).toString('utf-8')

    const { rows, errors } = parseCSV(text)

    if (!rows.length) {
      return reply.code(422).send({
        error: 'Nenhuma linha válida encontrada',
        validation_errors: errors,
      })
    }

    const inserted = []
    const insertErrors = []

    for (const row of rows) {
      try {
        const { rows: [item] } = await query(
          `INSERT INTO content (title, type, level, rule_number, body, points_reward, order_index)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, title, type, level, rule_number`,
          [row.title, row.type, row.level, row.rule_number, JSON.stringify(row.body), row.points_reward, row.order_index]
        )
        inserted.push(item)
      } catch (err) {
        insertErrors.push(`"${row.title}": ${err.message}`)
      }
    }

    return reply.code(207).send({
      imported:          inserted.length,
      skipped_rows:      errors.length,
      failed_inserts:    insertErrors.length,
      validation_errors: errors,
      insert_errors:     insertErrors,
      items:             inserted,
    })
  })

  // PATCH /content/:id — requer professor
  fastify.patch('/:id', {
    preHandler: [fastify.authenticate, fastify.requireTeacher],
    schema: {
      body: {
        type: 'object',
        properties: {
          title:         { type: 'string', minLength: 1, maxLength: 200 },
          type:          { type: 'string', enum: ['lesson','quiz','exercise'] },
          level:         { type: 'string', enum: ['A1','A2','B1','B2','C1','C2'] },
          rule_number:   { type: 'integer', minimum: 1, maximum: 16 },
          body:          { type: 'object' },
          points_reward: { type: 'integer', minimum: 0 },
          order_index:   { type: 'integer', minimum: 0 },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const allowed = ['title', 'type', 'level', 'rule_number', 'body', 'points_reward', 'order_index']
    const updates = Object.keys(request.body).filter(k => allowed.includes(k))
    if (updates.length === 0) return reply.code(400).send({ error: 'No valid fields to update' })

    const values = updates.map(k => k === 'body' ? JSON.stringify(request.body[k]) : request.body[k])
    const setClause = updates.map((k, i) => `${k} = $${i + 1}`).join(', ')
    values.push(request.params.id)

    const { rows: [item] } = await query(
      `UPDATE content SET ${setClause} WHERE id = $${values.length} RETURNING *`,
      values
    )
    if (!item) return reply.code(404).send({ error: 'Content not found' })
    return item
  })
}

module.exports = routes
