const { pool } = require('../db')

async function updateRankings(teacherId) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // Global ranking (scoped to teacher's students)
    await client.query(`
      INSERT INTO rankings (teacher_id, student_id, type, level, position, points, updated_at)
      SELECT $1, id, 'global', NULL,
             RANK() OVER (ORDER BY total_points DESC),
             total_points,
             NOW()
      FROM students
      WHERE teacher_id = $1
      ON CONFLICT (student_id, type, COALESCE(level, '__global__'), teacher_id)
      DO UPDATE SET
        position   = EXCLUDED.position,
        points     = EXCLUDED.points,
        updated_at = NOW()
    `, [teacherId])

    // By-level ranking (scoped to teacher's students)
    await client.query(`
      INSERT INTO rankings (teacher_id, student_id, type, level, position, points, updated_at)
      SELECT $1, id, 'by_level', level,
             RANK() OVER (PARTITION BY level ORDER BY total_points DESC),
             total_points,
             NOW()
      FROM students
      WHERE teacher_id = $1
      ON CONFLICT (student_id, type, COALESCE(level, '__global__'), teacher_id)
      DO UPDATE SET
        position   = EXCLUDED.position,
        points     = EXCLUDED.points,
        updated_at = NOW()
    `, [teacherId])

    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

module.exports = { updateRankings }
