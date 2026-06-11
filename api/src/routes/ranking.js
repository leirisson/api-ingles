const { query } = require('../db')

async function routes(fastify) {
  const userAuth = { preHandler: [fastify.authenticate] }

  // Extrai teacher_id: se professor usa o próprio id, se aluno usa o teacher_id do JWT
  function getTeacherId(user) {
    return user.role === 'teacher' ? user.id : user.teacher_id
  }

  // GET /ranking/global
  fastify.get('/ranking/global', userAuth, async (request) => {
    const teacherId = getTeacherId(request.user)
    const { rows } = await query(
      `SELECT r.position, s.name, s.level, r.points, s.current_streak
       FROM rankings r
       JOIN students s ON s.id = r.student_id
       WHERE r.type = 'global' AND r.teacher_id = $1
       ORDER BY r.position
       LIMIT 20`,
      [teacherId]
    )
    return { ranking: rows }
  })

  // GET /ranking/level/:lvl
  fastify.get('/ranking/level/:lvl', userAuth, async (request) => {
    const { lvl } = request.params
    const valid = ['A1','A2','B1','B2','C1','C2']
    if (!valid.includes(lvl)) return { ranking: [] }

    const teacherId = getTeacherId(request.user)
    const { rows } = await query(
      `SELECT r.position, s.name, s.level, r.points, s.current_streak
       FROM rankings r
       JOIN students s ON s.id = r.student_id
       WHERE r.type = 'by_level' AND r.level = $1 AND r.teacher_id = $2
       ORDER BY r.position
       LIMIT 20`,
      [lvl, teacherId]
    )
    return { ranking: rows }
  })
}

module.exports = routes
