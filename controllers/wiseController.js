"use strict";

const axios = require("axios");
const { pool } = require("../util/db");

// Wise API Config
const WISE_BASE_URL = "https://api.wiseapp.live";

// NOTE: Endpoint paths are based on Wise API conventions.
// If any return 404, verify against:
// https://documenter.getpostman.com/view/17903053/2sA3XPChyE

function createWiseClient() {
  const credentials = Buffer.from(
    `${process.env.WISE_USER_ID}:${process.env.WISE_API_KEY}`,
  ).toString("base64");

  return axios.create({
    baseURL: WISE_BASE_URL,
    timeout: 15000,
    headers: {
      Authorization: `Basic ${credentials}`,
      "x-api-key": process.env.WISE_API_KEY,
      "x-wise-namespace": process.env.WISE_NAMESPACE,
      "user-agent": `VendorIntegrations/${process.env.WISE_NAMESPACE}`,
      "Content-Type": "application/json",
    },
  });
}

// NEW
function endpoints(instId) {
  return {
    getBatches: `/institutes/${instId}/classes?classType=LIVE&showCoTeachers=true`,
    getStudents: (classId) =>
      `/user/classes/${classId}/participants?showCoTeachers=true`,
    getSessions: `/institutes/${instId}/sessions`,
    getAttendance: (classId, sessionId) =>
      `/user/classes/${classId}/sessions/${sessionId}?showLiveClassInsight=true&showSessionAIData=true&showSessionAttendees=true&showFeedbackConfig=true&showFeedbackSubmission=true&showSessionFiles=true&showAgendaStructure=true`,
    getTranscript: (sessionId) =>
      `/api/v1/analytics/sessions/${sessionId}/video_recording`,
  };
}

// Utilities
function safeData(response, fallback = []) {
  try {
    const body = response.data;
    if (body === null || body === undefined) return fallback;
    if (Array.isArray(body)) return body;
    if (Array.isArray(body.data)) return body.data;
    // body.data is an object — search for the first array field (Wise wraps arrays like { data: { sessions: [] } })
    if (body.data && typeof body.data === "object") {
      const d = body.data;
      for (const key of [
        "sessions",
        "classes",
        "students",
        "participants",
        "docs",
        "items",
        "results",
        "list",
      ]) {
        if (Array.isArray(d[key])) return d[key];
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

async function runInBatches(items, size, asyncFn) {
  const results = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const batchResults = await Promise.all(batch.map(asyncFn));
    results.push(...batchResults);
  }
  return results;
}

function getPreviousMonthRange() {
  const now = new Date();
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const month = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

function getLast7DaysRange() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 6);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

// Transcript Parsing
function parseVTTTranscript(vttText) {
  if (!vttText || typeof vttText !== "string") return {};
  const speakerWords = {};
  const lines = vttText.split(/\r?\n/);

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t === "WEBVTT") continue;
    if (/^\d+$/.test(t)) continue;
    if (/\d{2}:\d{2}:\d{2}[.,]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[.,]\d{3}/.test(t))
      continue;
    // Skip audio recordings played in class — not real student speech
    if (t.startsWith("Audio shared by")) continue;

    const colonIdx = t.indexOf(":");
    if (colonIdx < 2) continue;

    const speaker = t.substring(0, colonIdx).trim();
    const text = t.substring(colonIdx + 1).trim();
    const words = text.split(/\s+/).filter((w) => w.length > 0).length;
    if (words === 0) continue;

    speakerWords[speaker] = (speakerWords[speaker] || 0) + words;
  }
  return speakerWords;
}

function computeInteractionScores(speakerWords) {
  const entries = Object.entries(speakerWords);
  if (entries.length === 0)
    return { scores: {}, instructor: null, totalStudentWords: 0 };

  // Instructor = speaker with most total words
  entries.sort((a, b) => b[1] - a[1]);
  const [instructor] = entries[0];

  // Return raw word counts per student (NOT percentages).
  // Global % is computed later in computeStudentScores across all sessions.
  const scores = {};
  let totalStudentWords = 0;
  for (const [speaker, count] of entries) {
    if (speaker === instructor) continue;
    scores[speaker] = count;
    totalStudentWords += count;
  }
  return { scores, instructor, totalStudentWords };
}

function matchInteractionScore(studentName, transcriptScores) {
  if (!transcriptScores || Object.keys(transcriptScores).length === 0)
    return null;

  // Normalize: lowercase, strip accents, strip all non-alphanumeric
  const norm = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]/g, "");

  // 1. Exact key match
  if (transcriptScores[studentName] !== undefined)
    return transcriptScores[studentName];

  // 2. Normalized full-name match
  const normStudent = norm(studentName);
  for (const [tn, score] of Object.entries(transcriptScores)) {
    if (norm(tn) === normStudent) return score;
  }

  // 3. First-name match — only if exactly one transcript speaker shares it
  const studentFirst = norm(studentName.split(/\s+/)[0]);
  if (studentFirst.length >= 3) {
    const firstMatches = Object.entries(transcriptScores).filter(
      ([tn]) => norm(tn.split(/\s+/)[0]) === studentFirst,
    );
    if (firstMatches.length === 1) return firstMatches[0][1];
  }

  // 4. Any word part match (>= 3 chars)
  const studentParts = studentName
    .split(/\s+/)
    .map(norm)
    .filter((p) => p.length >= 3);
  for (const [tn, score] of Object.entries(transcriptScores)) {
    const transcriptParts = tn
      .split(/[\s.]+/)
      .map(norm)
      .filter((p) => p.length >= 3);
    if (studentParts.some((sp) => transcriptParts.includes(sp))) return score;
  }

  return null;
}

async function handleWiseWebhook(req, res) {
  // Respond immediately — Wise expects 200 within a few seconds
  res.status(200).json({ received: true });

  const { event, payload } = req.body || {};
  if (event !== "SessionTranscriptGeneratedEvent" || !payload?.sessionId)
    return;

  const sessionId = payload.sessionId;
  const classId = payload.classId || null;

  try {
    const wiseClient = createWiseClient();
    const instId = process.env.WISE_INSTITUTE_ID;
    const ep = endpoints(instId);

    // Fetch the full session detail to get the rawTranscript field and session date
    const sessionRes = await wiseClient.get(
      ep.getAttendance(classId, sessionId),
    );
    const sessionData = sessionRes.data?.data;
    if (!sessionData) return;

    const rawTranscriptEntries = sessionData.rawTranscript;
    const vttUrlEntry = Array.isArray(rawTranscriptEntries) && rawTranscriptEntries.length > 0
      ? rawTranscriptEntries[0]
      : null;
    const vttUrl = vttUrlEntry?.file?.path || vttUrlEntry?.url || null;

    if (!vttUrl) {
      console.log(`[Wise Webhook] No transcript URL yet for session ${sessionId}`);
      return;
    }

    const vttRes = await axios.get(vttUrl, {
      responseType: "text",
      timeout: 12000,
      headers: {
        Authorization: `Basic ${Buffer.from(`${process.env.WISE_USER_ID}:${process.env.WISE_API_KEY}`).toString("base64")}`,
        "x-api-key": process.env.WISE_API_KEY,
        "x-wise-namespace": process.env.WISE_NAMESPACE,
        "user-agent": `VendorIntegrations/${process.env.WISE_NAMESPACE}`,
      },
    });
    const rawTranscript = vttRes.data;

    if (typeof rawTranscript !== "string" || rawTranscript.trim() === "") {
      console.log(`[Wise Webhook] VTT file empty for session ${sessionId}`);
      return;
    }

    const sessionDate =
      (sessionData.scheduledStartTime || sessionData.start_time || "").split(
        "T",
      )[0] || null;

    const speakerWords = parseVTTTranscript(rawTranscript);
    const { scores, instructor, totalStudentWords } = computeInteractionScores(speakerWords);

    await pool.query(
      `INSERT INTO wise_transcripts (session_id, class_id, session_date, instructor_name, student_words, total_student_words)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (session_id) DO UPDATE
       SET student_words = EXCLUDED.student_words,
           total_student_words = EXCLUDED.total_student_words,
           instructor_name = EXCLUDED.instructor_name,
           processed_at = NOW()`,
      [
        sessionId,
        classId,
        sessionDate,
        instructor,
        JSON.stringify(scores),
        totalStudentWords,
      ],
    );
  } catch (err) {
    console.error(
      `[Wise Webhook] Failed to process session ${sessionId}:`,
      err.message,
    );
  }
}

// Per-Student Score Computation
// avgInteraction = each student's share of ALL MATCHED student words across sessions.
// Denominator only counts words successfully matched to a registered student,
// so unrecognised speakers (e.g. "Skillcase") don't create a phantom gap.
// The Largest Remainder Method is used so integer percentages always sum to 100.
// Absent sessions and sessions without a transcript are excluded.
function computeStudentScores(sessions, sessionDetails, students) {
  const studentMap = {};
  for (const student of students) {
    const id =
      student._id ||
      student.id ||
      student.userId ||
      student.user_id ||
      String(Math.random());
    const name =
      student.name || student.fullName || student.full_name || "Unknown";
    studentMap[id] = {
      id,
      name,
      totalClasses: sessions.length,
      absent: 0,
      wordCount: 0,
      transcriptSessionsAttended: 0,
    };
  }

  for (const { attendance, transcriptScores } of sessionDetails) {
    const hasTranscript =
      transcriptScores !== null &&
      typeof transcriptScores === "object" &&
      Object.keys(transcriptScores).length > 0;

    const attendedIds = new Set(
      (attendance || [])
        .filter((a) => !a.isTeacher && a.duration > 0)
        .map((a) => String(a.wiseUserId || a.userId || a.id)),
    );

    for (const [sid, data] of Object.entries(studentMap)) {
      const attended = attendedIds.has(sid);
      if (!attended) {
        data.absent++;
      } else if (hasTranscript) {
        const wordsSpoken = matchInteractionScore(data.name, transcriptScores) ?? 0;
        data.wordCount += wordsSpoken;
        data.transcriptSessionsAttended++;
      }
    }
  }

  // Denominator = only words matched to registered students.
  // This excludes unrecognised speakers so they don't create a phantom gap.
  const globalTotalMatchedWords = Object.values(studentMap).reduce(
    (s, d) => s + d.wordCount,
    0,
  );

  // Largest Remainder Method: distribute 100 integer points so they always sum
  // to exactly 100 among students who have transcript data.
  const eligible = Object.values(studentMap)
    .filter((d) => d.transcriptSessionsAttended > 0)
    .map((d) => {
      const exact =
        globalTotalMatchedWords > 0
          ? (d.wordCount / globalTotalMatchedWords) * 100
          : 0;
      return { id: d.id, exact, floored: Math.floor(exact), remainder: exact % 1 };
    });

  const totalFloored = eligible.reduce((s, d) => s + d.floored, 0);
  const toDistribute = Math.round(100 - totalFloored);
  eligible.sort((a, b) => b.remainder - a.remainder);
  for (let i = 0; i < toDistribute && i < eligible.length; i++) {
    eligible[i].floored += 1;
  }
  const interactionMap = new Map(eligible.map((d) => [d.id, d.floored]));

  return Object.values(studentMap).map((data) => {
    const absenceRate =
      data.totalClasses > 0 ? data.absent / data.totalClasses : 0;
    const attendanceScore = (1 - absenceRate) * 100;

    const hasInteraction = data.transcriptSessionsAttended > 0;
    const avgInteraction = hasInteraction
      ? (interactionMap.get(data.id) ?? 0)
      : null;

    const cumulatedScore =
      avgInteraction !== null
        ? Math.round(attendanceScore * 0.6 + avgInteraction * 0.4)
        : Math.round(attendanceScore * 0.6);

    return {
      id: data.id,
      name: data.name,
      totalClasses: data.totalClasses,
      absent: data.absent,
      avgInteraction,
      cumulatedScore,
    };
  });
}


//  Fetch Session Details (attendance + transcript)

async function fetchSessionDetails(wiseClient, sessions, classId) {
  const instId = process.env.WISE_INSTITUTE_ID;
  const ep = endpoints(instId);

  return runInBatches(sessions, 5, async (session) => {
    const sessionId =
      session._id || session.id || session.sessionId || session.session_id;

    const [attendanceRes] = await Promise.allSettled([
      wiseClient.get(ep.getAttendance(classId, sessionId)),
    ]);

    if (attendanceRes.status === "rejected") {
      console.error(
        `[Wise] Session ${sessionId} fetch failed:`,
        attendanceRes.reason?.message,
      );
    }

    const rawSession =
      attendanceRes.status === "fulfilled"
        ? attendanceRes.value.data?.data
        : null;
    const attendance = rawSession ? rawSession.participants || [] : [];

    // rawTranscript is an array of objects: [{ url, file: { path } }]
    // We download the VTT file from the URL and parse it for interaction scores.
    let transcriptScores = null;
    let sessionTotalStudentWords = 0;
    const rawTranscriptEntries = rawSession?.rawTranscript;
    const vttEntry = Array.isArray(rawTranscriptEntries) && rawTranscriptEntries.length > 0
      ? rawTranscriptEntries[0]
      : null;
    const vttUrl = vttEntry?.file?.path || vttEntry?.url || null;

    if (vttUrl) {
      try {
        const vttRes = await axios.get(vttUrl, {
          responseType: "text",
          timeout: 12000,
          headers: {
            Authorization: `Basic ${Buffer.from(`${process.env.WISE_USER_ID}:${process.env.WISE_API_KEY}`).toString("base64")}`,
            "x-api-key": process.env.WISE_API_KEY,
            "x-wise-namespace": process.env.WISE_NAMESPACE,
            "user-agent": `VendorIntegrations/${process.env.WISE_NAMESPACE}`,
          },
        });
        const vttText = vttRes.data;
        if (typeof vttText === "string" && vttText.trim().length > 0) {
          const speakerWords = parseVTTTranscript(vttText);
          const speakerCount = Object.keys(speakerWords).length;
          if (speakerCount > 0) {
            const { scores, instructor, totalStudentWords: sw } = computeInteractionScores(speakerWords);
            if (Object.keys(scores).length > 0) {
              transcriptScores = scores;
              sessionTotalStudentWords = sw;
            }
          } else {
            console.log(
              `[Wise Transcript] Session ${sessionId}: VTT downloaded but no speaker lines parsed. First 200 chars: ${vttText.substring(0, 200)}`,
            );
          }
        }
      } catch (e) {
        console.error(
          `[Wise Transcript] Session ${sessionId}: Failed to download VTT — ${e.response?.status || e.message}`,
        );
      }
    } else {
      console.log(`[Wise Transcript] Session ${sessionId}: No transcript available.`);
    }

    return {
      session,
      attendance,
      transcriptScores,
      totalStudentWords: sessionTotalStudentWords,
      resolvedDate:
        rawSession?.scheduledStartTime || rawSession?.start_time || null,
    };
  });
}

// Route Handlers

async function getBatches(req, res) {
  try {
    const wiseClient = createWiseClient();
    const instId = process.env.WISE_INSTITUTE_ID;
    const ep = endpoints(instId);

    const response = await wiseClient.get(ep.getBatches);
    const rawBody = response.data;

    // Handle various Wise API response shapes
    let batchList;
    if (Array.isArray(rawBody)) batchList = rawBody;
    else if (Array.isArray(rawBody.data)) batchList = rawBody.data;
    else if (Array.isArray(rawBody.classes)) batchList = rawBody.classes;
    else if (Array.isArray(rawBody.docs)) batchList = rawBody.docs;
    else if (rawBody.data && Array.isArray(rawBody.data.classes))
      batchList = rawBody.data.classes;
    else if (rawBody.data && Array.isArray(rawBody.data.docs))
      batchList = rawBody.data.docs;
    else batchList = [];

    const active = batchList.filter(
      (b) => (b.status || "").toLowerCase() !== "inactive",
    );

    res.json({
      batches: batchList.map((b) => ({
        id: b._id || b.id,
        name: b.subject || b.name || "Unnamed", // subject = "German B1 Level - I"
        status: b.status || "active",
        createdAt: b.createdAt || null,
      })),

      totalActive: active.length,
    });
  } catch (err) {
    const wiseErr = err.response
      ? { status: err.response.status, body: err.response.data }
      : { message: err.message };
    console.error("[Wise] getBatches error:", JSON.stringify(wiseErr, null, 2));
    res.status(502).json({
      error: "Failed to fetch batches from Wise API",
      detail: wiseErr,
    });
  }
}

function extractStudents(response) {
  try {
    const body = response.data;
    if (!body) return [];

    let suspendedIds = new Set();
    if (body.data?.suspendedStudents && Array.isArray(body.data.suspendedStudents)) {
      body.data.suspendedStudents.forEach(s => {
        if (s.userId) suspendedIds.add(String(s.userId));
        if (s.id) suspendedIds.add(String(s.id));
      });
    } else if (body.suspendedStudents && Array.isArray(body.suspendedStudents)) {
      body.suspendedStudents.forEach(s => {
        if (s.userId) suspendedIds.add(String(s.userId));
        if (s.id) suspendedIds.add(String(s.id));
      });
    }

    let pList = [];
    if (Array.isArray(body)) pList = body;
    else if (Array.isArray(body.data)) pList = body.data;
    else if (body.data && Array.isArray(body.data.students))
      pList = body.data.students;
    else if (body.data && Array.isArray(body.data.participants))
      pList = body.data.participants;
    else if (body.data && Array.isArray(body.data.joinedRequest))
      pList = body.data.joinedRequest;
    else if (Array.isArray(body.students)) pList = body.students;
    else if (Array.isArray(body.participants)) pList = body.participants;
    else {
      return [];
    }

    return pList.filter(p => {
      const uid = String(p._id || p.id || p.userId || p.wiseUserId || "unknown");
      return !suspendedIds.has(uid) && (p.status || "").toLowerCase() !== "suspended";
    });
  } catch {
    return [];
  }
}

async function getDashboardData(req, res) {
  const { batchId, startDate, endDate } = req.query;

  if (!batchId || !startDate || !endDate) {
    return res
      .status(400)
      .json({ error: "batchId, startDate and endDate are required" });
  }

  try {
    const wiseClient = createWiseClient();
    const instId = process.env.WISE_INSTITUTE_ID;
    const ep = endpoints(instId);
    const mtdRange = getPreviousMonthRange();
    const last7Range = getLast7DaysRange();

    // Parallel: sessions (3 ranges) + students
    const [mainRes, mtdRes, last7Res, studentsRes] = await Promise.allSettled([
      wiseClient.get(ep.getSessions, {
        params: { paginateBy: "DATE", classId: batchId, startDate, endDate },
      }),
      wiseClient.get(ep.getSessions, {
        params: {
          paginateBy: "DATE",
          classId: batchId,
          startDate: mtdRange.startDate,
          endDate: mtdRange.endDate,
        },
      }),
      wiseClient.get(ep.getSessions, {
        params: {
          paginateBy: "DATE",
          classId: batchId,
          startDate: last7Range.startDate,
          endDate: last7Range.endDate,
        },
      }),
      wiseClient.get(ep.getStudents(batchId)),
    ]);

    const mainSessions =
      mainRes.status === "fulfilled" ? safeData(mainRes.value) : [];
    const mtdSessions =
      mtdRes.status === "fulfilled" ? safeData(mtdRes.value) : [];
    const last7Sessions =
      last7Res.status === "fulfilled" ? safeData(last7Res.value) : [];
    const students =
      studentsRes.status === "fulfilled"
        ? extractStudents(studentsRes.value)
        : [];

    // Session details (attendance + transcripts)
    const [mainDetails, mtdDetails, last7Details] = await Promise.all([
      fetchSessionDetails(wiseClient, mainSessions, batchId),
      fetchSessionDetails(wiseClient, mtdSessions, batchId),
      fetchSessionDetails(wiseClient, last7Sessions, batchId),
    ]);

    // Compute scores
    const mainCandidates = computeStudentScores(
      mainSessions,
      mainDetails,
      students,
    );
    const mtdCandidates = computeStudentScores(
      mtdSessions,
      mtdDetails,
      students,
    );

    const mtdMap = {};
    for (const c of mtdCandidates) mtdMap[c.id] = c.cumulatedScore;

    const candidates = mainCandidates
      .map((c) => ({
        ...c,
        mtd: mtdMap[c.id] !== undefined ? mtdMap[c.id] : null,
      }))
      .sort((a, b) => b.cumulatedScore - a.cumulatedScore);

    const overallHealth =
      candidates.length > 0
        ? Math.round(
            candidates.reduce((s, c) => s + c.cumulatedScore, 0) /
              candidates.length,
          )
        : null;

    // Attendance grid (last 7 days)
    const gridDates = [];
    const cursor = new Date(last7Range.startDate);
    const gridEnd = new Date(last7Range.endDate);
    while (cursor <= gridEnd) {
      gridDates.push(cursor.toISOString().split("T")[0]);
      cursor.setDate(cursor.getDate() + 1);
    }

    const sessionDates = new Set();
    const attendanceByDate = {};

    for (const { session, attendance, resolvedDate } of last7Details) {
      const raw =
        resolvedDate ||
        session.date ||
        session.scheduledAt ||
        session.scheduled_at ||
        session.startTime ||
        "";
      const date = raw.split("T")[0];
      if (!date) continue;
      sessionDates.add(date);
      if (!attendanceByDate[date]) attendanceByDate[date] = new Set();
      attendance
        .filter((a) => !a.isTeacher && a.duration > 0)
        .forEach((a) =>
          attendanceByDate[date].add(String(a.wiseUserId || a.userId || a.id)),
        );
    }

    const attendanceGrid = {
      dates: gridDates,
      rows: candidates.map((c) => ({
        candidateId: c.id,
        candidateName: c.name,
        attendance: gridDates.map((date) => {
          if (!sessionDates.has(date)) return "no_class";
          const attended =
            attendanceByDate[date] && attendanceByDate[date].has(String(c.id));
          return attended ? "present" : "absent";
        }),
      })),
    };

    res.json({
      summary: {
        overallHealth,
        totalClassesInRange: mainSessions.length,
        mtdRange,
        dateRange: { startDate, endDate },
      },
      candidates,
      attendanceGrid,
    });
  } catch (err) {
    console.error("[Wise] getDashboardData error:", err.message);
    res
      .status(502)
      .json({ error: "Failed to fetch dashboard data from Wise API" });
  }
}

module.exports = { getBatches, getDashboardData, handleWiseWebhook };
