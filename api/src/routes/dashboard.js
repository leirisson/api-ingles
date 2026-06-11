const { query } = require('../db')

async function routes(fastify) {
  // GET /dashboard/me
  fastify.get('/dashboard/me', { preHandler: [fastify.authenticate] }, async (request) => {
    const studentId = request.user.id

    const [studentResult, progressResult, errorsResult] = await Promise.all([
      // Student + ranking position
      query(
        `SELECT s.id, s.name, s.level, s.total_points,
                s.current_streak, s.longest_streak, s.last_activity,
                r.position AS ranking_position
         FROM students s
         LEFT JOIN rankings r ON r.student_id = s.id AND r.type = 'global'
         WHERE s.id = $1`,
        [studentId]
      ),

      // Progress by rule (1-16)
      query(
        `SELECT
           c.rule_number,
           COUNT(c.id)                                          AS total_content,
           COUNT(p.id) FILTER (WHERE p.status = 'done')        AS completed,
           COALESCE(MAX(p.best_score), 0)                      AS best_score,
           COALESCE(AVG(p.best_score) FILTER (WHERE p.best_score > 0), 0) AS avg_score
         FROM content c
         LEFT JOIN progress p ON p.content_id = c.id AND p.student_id = $1
         GROUP BY c.rule_number
         ORDER BY c.rule_number`,
        [studentId]
      ),

      // Top 5 most common errors
      query(
        `SELECT
           COALESCE(c.title, 'Free conversation') AS content_title,
           c.rule_number,
           SUM(s.wrong)  AS total_errors,
           COUNT(s.id)   AS session_count
         FROM sessions s
         LEFT JOIN content c ON c.id = s.content_id
         WHERE s.student_id = $1 AND s.wrong > 0
         GROUP BY c.id, c.title, c.rule_number
         ORDER BY total_errors DESC
         LIMIT 5`,
        [studentId]
      ),
    ])

    const student = studentResult.rows[0]
    if (!student) throw { statusCode: 404, message: 'Student not found' }

    return {
      student: {
        id:               student.id,
        name:             student.name,
        level:            student.level,
        total_points:     student.total_points,
        current_streak:   student.current_streak,
        longest_streak:   student.longest_streak,
        last_activity:    student.last_activity,
        ranking_position: student.ranking_position,
      },
      progress_by_rule: progressResult.rows,
      top_errors:       errorsResult.rows,
    }
  })
}

module.exports = routes
