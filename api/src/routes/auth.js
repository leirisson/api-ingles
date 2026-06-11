const { query } = require('../db')
const { hashPassword, verifyPassword } = require('../services/auth')

async function routes(fastify) {
  // POST /auth/teacher/register — cadastro de professor
  fastify.post('/teacher/register', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name:     { type: 'string', minLength: 1, maxLength: 100 },
          email:    { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 6 },
        },
      },
    },
  }, async (request, reply) => {
    const { name, email, password } = request.body
    const password_hash = await hashPassword(password)

    const { rows: [teacher] } = await query(
      `INSERT INTO teachers (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name, email, password_hash]
    )

    const token = fastify.jwt.sign({ id: teacher.id, email: teacher.email, role: 'teacher' })
    return reply.code(201).send({ token, teacher })
  })

  // POST /auth/register — cadastro de aluno (requer teacher_id)
  fastify.post('/register', {
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'phone', 'password', 'level', 'teacher_id'],
        properties: {
          name:       { type: 'string', minLength: 1, maxLength: 100 },
          email:      { type: 'string', format: 'email' },
          phone:      { type: 'string', minLength: 8, maxLength: 20 },
          password:   { type: 'string', minLength: 6 },
          level:      { type: 'string', enum: ['A1','A2','B1','B2','C1','C2'] },
          teacher_id: { type: 'string', format: 'uuid' },
        },
      },
    },
  }, async (request, reply) => {
    const { name, email, phone, password, level, teacher_id } = request.body

    // Verify teacher exists
    const { rows: [teacher] } = await query('SELECT id FROM teachers WHERE id = $1', [teacher_id])
    if (!teacher) return reply.code(404).send({ error: 'Teacher not found' })

    const password_hash = await hashPassword(password)
    const { rows: [student] } = await query(
      `INSERT INTO students (teacher_id, name, email, phone, level, password_hash)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, teacher_id, name, email, phone, level, total_points, current_streak, created_at`,
      [teacher_id, name, email, phone, level, password_hash]
    )

    const token = fastify.jwt.sign({
      id: student.id, email: student.email, role: 'student', teacher_id: student.teacher_id,
    })
    return reply.code(201).send({ token, student })
  })

  // POST /auth/login — funciona para professor e aluno
  fastify.post('/login', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email:    { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const { email, password } = request.body

    // Tenta professor primeiro
    const { rows: [teacher] } = await query(
      'SELECT * FROM teachers WHERE email = $1',
      [email]
    )
    if (teacher) {
      const valid = await verifyPassword(password, teacher.password_hash)
      if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })
      const token = fastify.jwt.sign({ id: teacher.id, email: teacher.email, role: 'teacher' })
      const { password_hash, ...safeTeacher } = teacher
      return { token, user: { ...safeTeacher, role: 'teacher' } }
    }

    // Tenta aluno
    const { rows: [student] } = await query(
      'SELECT * FROM students WHERE email = $1',
      [email]
    )
    if (!student) return reply.code(401).send({ error: 'Invalid credentials' })

    const valid = await verifyPassword(password, student.password_hash)
    if (!valid) return reply.code(401).send({ error: 'Invalid credentials' })

    const token = fastify.jwt.sign({
      id: student.id, email: student.email, role: 'student', teacher_id: student.teacher_id,
    })
    const { password_hash, ...safeStudent } = student
    return { token, user: { ...safeStudent, role: 'student' } }
  })

  // GET /auth/me
  fastify.get('/me', { preHandler: [fastify.authenticate] }, async (request, reply) => {
    if (request.user.role === 'teacher') {
      const { rows: [teacher] } = await query(
        'SELECT id, name, email, created_at FROM teachers WHERE id = $1',
        [request.user.id]
      )
      if (!teacher) return reply.code(404).send({ error: 'Teacher not found' })
      return { ...teacher, role: 'teacher' }
    }

    const { rows: [student] } = await query(
      `SELECT id, teacher_id, name, email, phone, level, total_points,
              current_streak, longest_streak, last_activity, created_at
       FROM students WHERE id = $1`,
      [request.user.id]
    )
    if (!student) return reply.code(404).send({ error: 'Student not found' })
    return { ...student, role: 'student' }
  })
}

module.exports = routes
