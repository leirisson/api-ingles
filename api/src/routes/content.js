const { query } = require('../db')

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
