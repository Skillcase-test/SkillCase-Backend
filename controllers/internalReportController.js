const { pool } = require("../util/db");

function getYesterdayIST() {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  istTime.setDate(istTime.getDate() - 1);
  return istTime.toISOString().split("T")[0];
}

async function getDailyReport(req, res) {
  try {
    const today = getYesterdayIST();

    const [
      streakMaintainers,
      dauToday,
      newInstalls,
      sessionStats,
      eventRegistrations,
      hardcoreExamSummary,
      hardcoreExamScores,
    ] = await Promise.all([
      // Who maintained streak today (daily_goal_met = true)
      pool.query(
        `SELECT
            u.fullname,
            u.username,
            us.current_streak
          FROM user_daily_activity uda
          JOIN app_user u ON uda.user_id = u.user_id
          JOIN user_streak us ON uda.user_id = us.user_id
          WHERE uda.activity_date = $1
            AND uda.daily_goal_met = true
            AND u.role = 'user'
          ORDER BY us.current_streak DESC`,
        [today],
      ),

      // DAU yesterday — same query your dashboard uses
      pool.query(
        `WITH all_activities AS (
    SELECT user_id, modified_at AS activity_time 
      FROM user_chapter_submissions WHERE test_status = true 
      AND DATE(modified_at AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id, last_accessed 
      FROM user_pronounce_progress WHERE completed = true 
      AND DATE(last_accessed AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id, last_accessed 
      FROM user_conversation_progress WHERE completed = true 
      AND DATE(last_accessed AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id, completed_at 
      FROM user_story_progress WHERE completed = true 
      AND DATE(completed_at AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id::text, last_reviewed 
      FROM a2_flashcard_progress WHERE is_completed = true 
      AND DATE(last_reviewed AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id::text, last_practiced 
      FROM a2_grammar_progress WHERE is_completed = true 
      AND DATE(last_practiced AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id::text, last_practiced 
      FROM a2_listening_progress WHERE is_completed = true 
      AND DATE(last_practiced AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id::text, last_practiced 
      FROM a2_speaking_progress WHERE is_completed = true 
      AND DATE(last_practiced AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id::text, last_practiced 
      FROM a2_reading_progress WHERE is_completed = true 
      AND DATE(last_practiced AT TIME ZONE 'Asia/Kolkata') = $1::date
    UNION ALL
    SELECT user_id::text, last_attempted 
      FROM a2_test_progress WHERE is_fully_completed = true 
      AND DATE(last_attempted AT TIME ZONE 'Asia/Kolkata') = $1::date
  )
  SELECT DISTINCT
    u.fullname,
    u.username,
    u.current_profeciency_level
  FROM all_activities a
  JOIN app_user u ON a.user_id = u.user_id
  WHERE u.role = 'user'
  ORDER BY u.fullname`,
        [today],
      ),

      // New app installs today
      pool.query(
        `SELECT
            fullname,
            username,
            phone,
            signup_source,
            TO_CHAR(
              ((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata'),
              'HH12:MI AM'
            ) AS install_time_ist
          FROM app_user
          WHERE DATE(((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')) = $1::date
            AND role = 'user'
          ORDER BY created_at ASC`,
        [today],
      ),

      // Session stats — active in last 24h and last 1h
      pool.query(
        `SELECT COUNT(*) FILTER (
    WHERE DATE(last_activity_at AT TIME ZONE 'Asia/Kolkata') = $1
  ) AS active_yesterday,
  COUNT(*) FILTER (
    WHERE DATE(((created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')) <= $1::date
  ) AS total_users
  FROM app_user
  WHERE role = 'user'`,
        [today],
      ),

      // Event registrations today
      pool.query(
        `SELECT
    er.name,
    er.email,
    er.phone,
    e.title AS event_title,
    (er.registered_at AT TIME ZONE 'Asia/Kolkata') AS registered_at_ist
  FROM event_registration er
  JOIN event e ON er.event_id = e.event_id
  WHERE DATE(er.registered_at AT TIME ZONE 'Asia/Kolkata') = $1
  ORDER BY er.registered_at ASC`,
        [today],
      ),
    ]);



    res.status(200).json({
      date: today,
      streakMaintainers: {
        count: streakMaintainers.rows.length,
        users: streakMaintainers.rows,
      },
      dauToday: {
        count: dauToday.rows.length,
        users: dauToday.rows.slice(0, 30),
      },
      newInstalls: {
        count: newInstalls.rows.length,
        users: newInstalls.rows,
      },
      sessionStats: sessionStats.rows[0],
      eventRegistrations: {
        count: eventRegistrations.rows.length,
        registrations: eventRegistrations.rows,
      },
    });
  } catch (error) {
    console.error("[DailyReport] Error:", error);
    res.status(500).json({ error: "Error fetching daily report" });
  }
}

async function getOpsReport(req, res) {
  try {
    const yesterday = getYesterdayIST();

    // 1. Hardcore Exams Query
    const [hardcoreExamSummary, hardcoreExamScores] = await Promise.all([
      pool.query(
        `SELECT
            ht.test_id,
            ht.title,
            ht.proficiency_level,
            ht.duration_minutes,
            COUNT(s.submission_id) AS participants,
            COUNT(*) FILTER (WHERE s.status = 'completed') AS completed_count,
            COUNT(*) FILTER (WHERE s.status = 'auto_closed') AS auto_closed_count,
            COUNT(*) FILTER (WHERE s.status = 'warned_out') AS warned_out_count,
            ROUND(AVG(s.score)::numeric, 2) AS avg_score
          FROM hardcore_test ht
          JOIN hardcore_test_submission s ON s.test_id = ht.test_id
          WHERE DATE(((COALESCE(s.finished_at, s.started_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')) = $1::date
          GROUP BY ht.test_id, ht.title, ht.proficiency_level, ht.duration_minutes
          ORDER BY participants DESC, avg_score DESC NULLS LAST`,
        [yesterday],
      ),
      pool.query(
        `SELECT
            ht.test_id,
            ht.title AS exam_title,
            u.fullname,
            u.username,
            s.status,
            s.warning_count,
            s.earned_points,
            s.total_points,
            s.score,
            ((s.started_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') AS started_at_ist,
            ((s.finished_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') AS finished_at_ist
          FROM hardcore_test_submission s
          JOIN hardcore_test ht ON ht.test_id = s.test_id
          JOIN app_user u ON u.user_id = s.user_id
          WHERE DATE(((COALESCE(s.finished_at, s.started_at) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')) = $1::date
          ORDER BY ht.title, s.score DESC NULLS LAST, u.fullname`,
        [yesterday],
      ),
    ]);

    const submissionsByTestId = hardcoreExamScores.rows.reduce((acc, row) => {
      if (!acc[row.test_id]) acc[row.test_id] = [];
      acc[row.test_id].push(row);
      return acc;
    }, {});

    const hardcoreExams = hardcoreExamSummary.rows.map((exam) => {
      const submissions = submissionsByTestId[exam.test_id] || [];
      const scoredSubmissions = submissions.filter(
        (s) => s.score !== null && s.score !== undefined,
      );
      const topPerformers = [...scoredSubmissions]
        .sort((a, b) => Number(b.score) - Number(a.score))
        .slice(0, 5);
      const lowPerformers = [...scoredSubmissions]
        .sort((a, b) => Number(a.score) - Number(b.score))
        .slice(0, 5);

      return {
        ...exam,
        topPerformers,
        lowPerformers,
        submissions,
      };
    });

    // 2. Wise Data
    const wiseData = {
      classesYesterday: [],
      consecutivelyAbsent: [],
    };

    if (process.env.WISE_API_KEY && process.env.WISE_INSTITUTE_ID) {
      const axios = require("axios");
      const wiseClient = axios.create({
        baseURL: "https://api.wiseapp.live",
        timeout: 15000,
        headers: {
          Authorization: `Basic ${Buffer.from(`${process.env.WISE_USER_ID}:${process.env.WISE_API_KEY}`).toString("base64")}`,
          "x-api-key": process.env.WISE_API_KEY,
          "x-wise-namespace": process.env.WISE_NAMESPACE,
          "user-agent": `VendorIntegrations/${process.env.WISE_NAMESPACE}`,
          "Content-Type": "application/json",
        },
      });

      const instId = process.env.WISE_INSTITUTE_ID;
      
      const now = new Date();
      const istOffset = 5.5 * 60 * 60 * 1000;
      const istTime = new Date(now.getTime() + istOffset);
      
      // Calculate 7 days ago to fetch recent sessions for absence tracking
      const sevenDaysTime = new Date(now.getTime() + istOffset);
      sevenDaysTime.setDate(sevenDaysTime.getDate() - 7);
      const sevenDaysAgo = sevenDaysTime.toISOString().split("T")[0];

      try {
        // 1. Fetch all classes for the institute first
        const batchesRes = await wiseClient.get(`/institutes/${instId}/classes?classType=LIVE&showCoTeachers=true`);
        
        let classes = [];
        const bBody = batchesRes.data?.data || batchesRes.data;
        if (Array.isArray(bBody)) classes = bBody;
        else if (Array.isArray(bBody?.classes)) classes = bBody.classes;
        else if (Array.isArray(bBody?.docs)) classes = bBody.docs;

        const batchSize = 3;
        for (let i = 0; i < classes.length; i += batchSize) {
          const batch = classes.slice(i, i + batchSize);
          await Promise.all(
            batch.map(async (cls) => {
              const classId = cls._id || cls.id;
              // batch name is usually in 'subject' or 'title'
              const className = cls.subject || cls.classSubject || cls.name || `Class ${classId}`;
              
              // 2. Fetch sessions for this specific class
              const sessionsRes = await wiseClient.get(`/institutes/${instId}/sessions`, {
                params: { classId, startDate: sevenDaysAgo, endDate: yesterday, paginateBy: "DATE" },
              });

              let sessions = [];
              const sBody = sessionsRes.data;
              if (Array.isArray(sBody)) sessions = sBody;
              else if (Array.isArray(sBody?.data)) sessions = sBody.data;
              else if (Array.isArray(sBody?.data?.sessions)) sessions = sBody.data.sessions;
              else if (Array.isArray(sBody?.data?.docs)) sessions = sBody.data.docs;

              if (sessions.length === 0) return;

              // Sort sessions newest first
              sessions.sort((a, b) => {
                const da = new Date(a.scheduledStartTime || a.start_time || a.startTime || 0).getTime();
                const db = new Date(b.scheduledStartTime || b.start_time || b.startTime || 0).getTime();
                return db - da;
              });

              // 3. Fetch participants for this class
              let stdRes;
              try {
                stdRes = await wiseClient.get(`/user/classes/${classId}/participants?showCoTeachers=false`);
              } catch (e) {
                return;
              }
              
              let pList = [];
              const pBody = stdRes.data;
              
              let suspendedIds = new Set();
              if (pBody?.data?.suspendedStudents && Array.isArray(pBody.data.suspendedStudents)) {
                pBody.data.suspendedStudents.forEach(s => {
                  if (s.userId) suspendedIds.add(String(s.userId));
                  if (s.id) suspendedIds.add(String(s.id));
                });
              }

              if (Array.isArray(pBody)) pList = pBody;
              else if (Array.isArray(pBody?.data)) pList = pBody.data;
              else if (pBody?.data && Array.isArray(pBody.data.students)) pList = pBody.data.students;
              else if (pBody?.data && Array.isArray(pBody.data.participants)) pList = pBody.data.participants;
              else if (pBody?.data && Array.isArray(pBody.data.joinedRequest)) pList = pBody.data.joinedRequest;
              else if (Array.isArray(pBody?.students)) pList = pBody.students;
              else if (Array.isArray(pBody?.participants)) pList = pBody.participants;

              const students = pList.filter(p => {
                const uid = String(p._id || p.id || p.userId || p.wiseUserId || "unknown");
                return !p.isTeacher && !suspendedIds.has(uid) && (p.status || "").toLowerCase() !== "suspended";
              });
              if (students.length === 0) return;

              // 4. Check sessions and attendance
              const yesterdaySession = sessions.find(s => (s.scheduledStartTime || s.start_time || "").split("T")[0] === yesterday);
              
              // Fetch attendance for recent sessions (up to 10)
              const recentSessions = sessions.slice(0, 10);
              const attendanceMap = {};

              await Promise.all(recentSessions.map(async (session) => {
                const sessId = session._id || session.id || session.sessionId;
                try {
                  const detRes = await wiseClient.get(`/user/classes/${classId}/sessions/${sessId}?showSessionAttendees=true`);
                  const body = detRes.data?.data || detRes.data;
                  const attList = body?.participants || body?.attendees || [];
                  attendanceMap[sessId] = new Set(
                    attList
                      .filter(a => !a.isTeacher && (a.duration > 0 || a.isPresent))
                      .map(a => String(a.wiseUserId || a.userId || a.id))
                  );
                } catch (err) {
                  attendanceMap[sessId] = new Set();
                }
              }));

              // 5. Update Yesterday Report
              if (yesterdaySession) {
                const sessId = yesterdaySession._id || yesterdaySession.id || yesterdaySession.sessionId;
                const yesterdayPresent = attendanceMap[sessId]?.size || 0;
                
                let durationStr = "N/A";
                const dur = yesterdaySession.duration || yesterdaySession.actualDuration;
                if (dur) {
                  const h = Math.floor(dur / 60);
                  const m = Math.floor(dur % 60);
                  durationStr = `${h}:${m.toString().padStart(2, '0')} hours`;
                }

                wiseData.classesYesterday.push({
                  className,
                  present: yesterdayPresent,
                  total: students.length,
                  duration: durationStr
                });
              }

              // 6. Update Absentee Report
              for (const student of students) {
                const studentId = String(student._id || student.id || student.userId || student.wiseUserId);
                const sName = student.name || student.fullName || "Unknown";
                
                let consecutiveMisses = 0;
                for (const session of recentSessions) {
                  const sessId = session._id || session.id || session.sessionId;
                  if (attendanceMap[sessId] && attendanceMap[sessId].has(studentId)) {
                    break;
                  }
                  consecutiveMisses++;
                }

                if (consecutiveMisses >= 3) {
                  wiseData.consecutivelyAbsent.push({
                    studentName: sName,
                    className,
                    missCount: consecutiveMisses
                  });
                }
              }
            })
          );
        }
      } catch (err) {
        console.error("[OpsReport] Error fetching Wise data:", err.message);
      }
    }

    res.status(200).json({
      date: yesterday,
      hardcoreExamReport: {
        examsConductedCount: hardcoreExams.length,
        totalSubmissions: hardcoreExamScores.rows.length,
        exams: hardcoreExams,
        submissions: hardcoreExamScores.rows,
      },
      wiseReport: wiseData,
    });
  } catch (error) {
    console.error("[OpsReport] Error:", error);
    res.status(500).json({ error: "Error fetching ops report" });
  }
}

module.exports = { getDailyReport, getOpsReport };
