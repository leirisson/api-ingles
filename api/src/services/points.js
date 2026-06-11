const MILESTONES = [
  { days: 3,  points: 15,  reason: 'streak_milestone_3' },
  { days: 7,  points: 40,  reason: 'streak_milestone_7' },
  { days: 14, points: 80,  reason: 'streak_milestone_14' },
  { days: 30, points: 150, reason: 'streak_milestone_30' },
]

function getTodayUTC4() {
  const utc4 = new Date(Date.now() - 4 * 60 * 60 * 1000)
  return utc4.toISOString().slice(0, 10) // 'YYYY-MM-DD'
}

function getDateUTC4(timestamp) {
  const utc4 = new Date(new Date(timestamp).getTime() - 4 * 60 * 60 * 1000)
  return utc4.toISOString().slice(0, 10)
}

async function recalculateStreak(client, studentId, todayStr) {
  const { rows } = await client.query(
    `SELECT date FROM streaks
     WHERE student_id = $1
       AND date >= $2::date - INTERVAL '32 days'
     ORDER BY date DESC`,
    [studentId, todayStr]
  )
  const dateSet = new Set(rows.map(r => {
    const d = new Date(r.date)
    return d.toISOString().slice(0, 10)
  }))
  let streak = 0
  const check = new Date(todayStr + 'T12:00:00Z')
  while (true) {
    const key = check.toISOString().slice(0, 10)
    if (!dateSet.has(key)) break
    streak++
    check.setUTCDate(check.getUTCDate() - 1)
  }
  return streak
}

async function getMilestonesAlreadyCredited(client, studentId) {
  const { rows } = await client.query(
    `SELECT reason FROM points_log
     WHERE student_id = $1
       AND reason LIKE 'streak_milestone_%'
       AND created_at > COALESCE(
         (SELECT MAX(created_at) FROM points_log
          WHERE student_id = $1 AND reason = 'streak_reset'),
         '2000-01-01'
       )`,
    [studentId]
  )
  return new Set(rows.map(r => r.reason))
}

async function processSession(client, studentId, sessionData) {
  const today = getTodayUTC4()
  const { correct = 0, wrong = 0 } = sessionData

  // Row-lock the student to prevent race conditions
  const { rows: [student] } = await client.query(
    'SELECT * FROM students WHERE id = $1 FOR UPDATE',
    [studentId]
  )

  // Detect streak reset (student missed at least 1 day)
  if (student.current_streak > 0 && student.last_activity) {
    const lastDay = getDateUTC4(student.last_activity)
    const yesterday = new Date(today + 'T12:00:00Z')
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)
    const yesterdayStr = yesterday.toISOString().slice(0, 10)
    if (lastDay < yesterdayStr) {
      await client.query(
        `INSERT INTO points_log (student_id, amount, reason)
         VALUES ($1, 0, 'streak_reset')`,
        [studentId]
      )
    }
  }

  // Upsert today's streak record
  await client.query(
    `INSERT INTO streaks (student_id, date, sessions_count, points_earned)
     VALUES ($1, $2, 1, 0)
     ON CONFLICT (student_id, date)
     DO UPDATE SET sessions_count = streaks.sessions_count + 1`,
    [studentId, today]
  )

  // Check if this is the first session of the day (before this insert)
  const { rows: [{ count: sessionsTodayBefore }] } = await client.query(
    `SELECT COUNT(*) FROM sessions
     WHERE student_id = $1
       AND DATE(created_at AT TIME ZONE 'America/Manaus') = $2::date`,
    [studentId, today]
  )
  const isFirstToday = parseInt(sessionsTodayBefore, 10) === 0

  // Recalculate streak
  const newStreak = await recalculateStreak(client, studentId, today)

  // Calculate points
  const pointEvents = []
  pointEvents.push({ amount: 10, reason: 'session_complete' })
  if (isFirstToday) pointEvents.push({ amount: 5, reason: 'first_session_today' })
  if (wrong === 0 && correct > 0) pointEvents.push({ amount: 20, reason: 'perfect_session' })

  // Milestone bonuses
  const credited = await getMilestonesAlreadyCredited(client, studentId)
  for (const m of MILESTONES) {
    if (newStreak >= m.days && !credited.has(m.reason)) {
      pointEvents.push({ amount: m.points, reason: m.reason })
    }
  }

  const totalPoints = pointEvents.reduce((sum, e) => sum + e.amount, 0)

  // Insert points_log entries
  for (const event of pointEvents) {
    await client.query(
      `INSERT INTO points_log (student_id, amount, reason)
       VALUES ($1, $2, $3)`,
      [studentId, event.amount, event.reason]
    )
  }

  // Update streak points_earned for today
  await client.query(
    `UPDATE streaks SET points_earned = points_earned + $1
     WHERE student_id = $2 AND date = $3`,
    [totalPoints, studentId, today]
  )

  // Update student totals
  await client.query(
    `UPDATE students SET
       total_points    = total_points + $1,
       current_streak  = $2,
       longest_streak  = GREATEST(longest_streak, $2),
       last_activity   = NOW()
     WHERE id = $3`,
    [totalPoints, newStreak, studentId]
  )

  return { pointsAwarded: totalPoints, events: pointEvents, newStreak }
}

module.exports = { processSession }
