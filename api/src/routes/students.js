const { query } = require('../db')
const { hashPassword } = require('../services/auth')

const ALLOWED_FIELDS = ['name', 'email', 'phone', 'level']

async function routes(fastify) {
  // GET /students
  fastify.get('/', {
    preHandler: [fastify.authenticate, fastify.requireTeacher],
  }, async (request) => {
    const { rows } = await query(
      `SELECT id, teacher_id, name, email, phone, level, total_points,
              current_streak, longest_streak, last_activity, created_at
       FROM students
       WHERE teacher_id = $1
       ORDER BY total_points DESC`,
      [request.user.id]
    )
    return rows
  })

  // GET /students/:id
  fastify.get('/:id', {
    preHandler: [fastify.authenticate, fastify.requireTeacher],
  }, async (request, reply) => {
    const { rows: [student] } = await query(
      `SELECT id, teacher_id, name, email, phone, level, total_points,
              current_streak, longest_streak, last_activity, created_at
       FROM students WHERE id = $1 AND teacher_id = $2`,
      [request.params.id, request.user.id]
    )
    if (!student) return reply.code(404).send({ error: 'Student not found' })
    return student
  })

  // POST /students — professor cria aluno diretamente
  fastify.post('/', {
    preHandler: [fastify.authenticate, fastify.requireTeacher],
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'phone', 'password', 'level'],
        properties: {
          name:     { type: 'string', minLength: 1, maxLength: 100 },
          email:    { type: 'string', format: 'email' },
          phone:    { type: 'string', minLength: 8, maxLength: 20 },
          password: { type: 'string', minLength: 6 },
          level:    { type: 'string', enum: ['A1','A2','B1','B2','C1','C2'] },
        },
      },
    },
  }, async (request, reply) => {
    const { name, email, phone, password, level } = request.body
    const password_hash = await hashPassword(password)

    const { rows: [student] } = await query(
      `INSERT INTO students (teacher_id, name, email, phone, level, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, teacher_id, name, email, phone, level, total_points, current_streak, created_at`,
      [request.user.id, name, email, phone, level, password_hash]
    )
    return reply.code(201).send(student)
  })

  // PATCH /students/:id
  fastify.patch('/:id', {
    preHandler: [fastify.authenticate, fastify.requireTeacher],
    schema: {
      body: {
        type: 'object',
        properties: {
          name:  { type: 'string', minLength: 1, maxLength: 100 },
          email: { type: 'string', format: 'email' },
          phone: { type: 'string', minLength: 8, maxLength: 20 },
          level: { type: 'string', enum: ['A1','A2','B1','B2','C1','C2'] },
        },
        additionalProperties: false,
      },
    },
  }, async (request, reply) => {
    const updates = Object.keys(request.body).filter(k => ALLOWED_FIELDS.includes(k))
    if (updates.length === 0) return reply.code(400).send({ error: 'No valid fields to update' })

    const setClause = updates.map((k, i) => `${k} = $${i + 1}`).join(', ')
    const values = [...updates.map(k => request.body[k]), request.params.id, request.user.id]

    const { rows: [student] } = await query(
      `UPDATE students SET ${setClause}
       WHERE id = $${values.length - 1} AND teacher_id = $${values.length}
       RETURNING id, teacher_id, name, email, phone, level, total_points, current_streak`,
      values
    )
    if (!student) return reply.code(404).send({ error: 'Student not found' })
    return student
  })

  // DELETE /students/:id
  fastify.delete('/:id', {
    preHandler: [fastify.authenticate, fastify.requireTeacher],
  }, async (request, reply) => {
    const { rowCount } = await query(
      'DELETE FROM students WHERE id = $1 AND teacher_id = $2',
      [request.params.id, request.user.id]
    )
    if (rowCount === 0) return reply.code(404).send({ error: 'Student not found' })
    return reply.code(204).send()
  })
}

module.exports = routes
