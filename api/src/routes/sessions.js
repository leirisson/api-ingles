const { pool, query } = require('../db')
const { processSession } = require('../services/points')
const { updateRankings } = require('../services/ranking')

const SCORE_DONE_THRESHOLD = parseInt(process.env.SCORE_DONE_THRESHOLD || '70', 10)

async function routes(fastify) {
  const teacherAuth = { preHandler: [fastify.authenticate, fastify.requireTeacher] }
  const userAuth    = { preHandler: [fastify.authenticate] }

  // POST /sessions — chamado pelo n8n usando JWT do professor
  fastify.post('/sessions', teacherAuth, async (request, reply) => {
    const {
      student_phone,
      content_id    = null,
      modality,
      correct       = 0,
      wrong         = 0,
      duration_min  = 0,
    } = request.body

    if (!student_phone || !modality) {
      return reply.code(400).send({ error: 'student_phone and modality are required' })
    }

    // Busca aluno pelo telefone dentro da turma do professor
    const { rows: [student] } = await query(
      'SELECT id, teacher_id FROM students WHERE phone = $1 AND teacher_id = $2',
      [student_phone, request.user.id]
    )
    if (!student) return reply.code(404).send({ error: 'Student not found' })

    const score = Math.max(0, correct * 10 - wrong * 5)

    const client = await pool.connect()
    let sessionRow
    let pointsResult
    try {
      await client.query('BEGIN')

      const { rows: [session] } = await client.query(
        `INSERT INTO sessions (student_id, content_id, modality, score, correct, wrong, duration_min)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [student.id, content_id, modality, score, correct, wrong, duration_min]
      )
      sessionRow = session

      pointsResult = await processSession(client, student.id, { correct, wrong })

      if (content_id) {
        const status = score >= SCORE_DONE_THRESHOLD ? 'done' : 'in_progress'
        await client.query(
          `INSERT INTO progress (student_id, content_id, status, best_score, completed_at)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (student_id, content_id) DO UPDATE SET
             status       = CASE WHEN progress.status = 'done' THEN 'done' ELSE EXCLUDED.status END,
             best_score   = GREATEST(progress.best_score, EXCLUDED.best_score),
             completed_at = CASE
               WHEN EXCLUDED.status = 'done' AND progress.completed_at IS NULL THEN NOW()
               ELSE progress.completed_at
             END`,
          [student.id, content_id, status, score, status === 'done' ? new Date() : null]
        )
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }

    // Atualiza ranking da turma do professor
    await updateRankings(request.user.id)

    return reply.code(201).send({ session: sessionRow, points: pointsResult })
  })

  // GET /sessions/me — histórico do aluno logado
  fastify.get('/sessions/me', userAuth, async (request) => {
    const { rows } = await query(
      `SELECT s.*, c.title AS content_title, c.rule_number
       FROM sessions s
       LEFT JOIN content c ON c.id = s.content_id
       WHERE s.student_id = $1
       ORDER BY s.created_at DESC
       LIMIT 100`,
      [request.user.id]
    )
    return rows
  })

  // GET /streak/me
  fastify.get('/streak/me', userAuth, async (request) => {
    const [studentResult, streakResult] = await Promise.all([
      query('SELECT current_streak, longest_streak FROM students WHERE id = $1', [request.user.id]),
      query(
        `SELECT date, sessions_count, points_earned
         FROM streaks
         WHERE student_id = $1
           AND date >= CURRENT_DATE - INTERVAL '30 days'
         ORDER BY date DESC`,
        [request.user.id]
      ),
    ])
    const student = studentResult.rows[0]
    return {
      current_streak: student?.current_streak || 0,
      longest_streak: student?.longest_streak || 0,
      history: streakResult.rows,
    }
  })

  // GET /points/me
  fastify.get('/points/me', userAuth, async (request) => {
    const { rows } = await query(
      `SELECT amount, reason, created_at
       FROM points_log
       WHERE student_id = $1
         AND reason != 'streak_reset'
       ORDER BY created_at DESC
       LIMIT 100`,
      [request.user.id]
    )
    return rows
  })
}

module.exports = routes
