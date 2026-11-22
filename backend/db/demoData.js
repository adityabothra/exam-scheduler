/**
 * Demo dataset. Inserted into the REAL database by loadDemoDataset().
 *
 * Built-in scenarios:
 *  - HS101 is taken by all 40 students and the largest room seats 30  -> multi-room examination
 *  - students taking 4-5 subjects, cross-department electives          -> overlapping student populations
 *  - rooms and faculty with blocked slots                              -> limited availability
 *  - 12 usable slots + 4 holiday slots, mixed 120/150/180 minute exams -> duration handling
 */
const { pool } = require('../config/database');

const NAMES = [
  'Aarav Mehta', 'Diya Sharma', 'Vihaan Gupta', 'Ananya Iyer', 'Arjun Nair', 'Ishita Banerjee', 'Kabir Singh', 'Meera Reddy',
  'Rohan Das', 'Saanvi Patel', 'Aditya Verma', 'Navya Pillai', 'Krish Malhotra', 'Tara Chatterjee', 'Yash Kulkarni', 'Riya Joshi',
  'Dev Bhatt', 'Pooja Menon', 'Siddharth Rao', 'Neha Kapoor', 'Harsh Agarwal', 'Kavya Krishnan', 'Manav Saxena', 'Isha Desai',
  'Nikhil Bose', 'Aisha Khan', 'Varun Shetty', 'Sneha Mukherjee', 'Karan Thakur', 'Lakshmi Narayan', 'Rahul Sen', 'Priya Ghosh',
  'Aman Tiwari', 'Sana Qureshi', 'Tushar Jain', 'Ritika Dutta', 'Omkar Patil', 'Mitali Sinha', 'Zoya Ahmed', 'Abhay Chauhan',
];

function buildDemoDataset() {
  const departments = [
    { code: 'CSE', name: 'Computer Science & Engineering' },
    { code: 'ECE', name: 'Electronics & Communication Engineering' },
    { code: 'ME', name: 'Mechanical Engineering' },
    { code: 'MA', name: 'Mathematics' },
    { code: 'HUM', name: 'Humanities & Social Sciences' },
  ];
  const courses = [
    { code: 'BTCSE', name: 'B.Tech Computer Science', dept: 'CSE' },
    { code: 'BTECE', name: 'B.Tech Electronics & Communication', dept: 'ECE' },
    { code: 'BTME', name: 'B.Tech Mechanical Engineering', dept: 'ME' },
    { code: 'BSMA', name: 'B.Sc Mathematics', dept: 'MA' },
  ];

  const subjects = [
    { code: 'CS301', name: 'Data Structures & Algorithms', dept: 'CSE', semester: 3, duration: 180, priority: 4 },
    { code: 'CS302', name: 'Database Management Systems', dept: 'CSE', semester: 3, duration: 180, priority: 3 },
    { code: 'CS501', name: 'Artificial Intelligence', dept: 'CSE', semester: 5, duration: 180, priority: 5 },
    { code: 'CS502', name: 'Computer Networks', dept: 'CSE', semester: 5, duration: 180, priority: 3 },
    { code: 'EC301', name: 'Digital Electronics', dept: 'ECE', semester: 3, duration: 180, priority: 4 },
    { code: 'EC302', name: 'Network Analysis', dept: 'ECE', semester: 3, duration: 120, priority: 3 },
    { code: 'EC501', name: 'Signals and Systems', dept: 'ECE', semester: 5, duration: 180, priority: 4 },
    { code: 'ME301', name: 'Engineering Thermodynamics', dept: 'ME', semester: 3, duration: 180, priority: 4 },
    { code: 'ME501', name: 'Fluid Mechanics', dept: 'ME', semester: 5, duration: 180, priority: 3 },
    { code: 'MA301', name: 'Probability and Statistics', dept: 'MA', semester: 3, duration: 120, priority: 3 },
    { code: 'MA401', name: 'Numerical Methods', dept: 'MA', semester: 5, duration: 150, priority: 3 },
    { code: 'HS101', name: 'Professional Communication', dept: 'HUM', semester: 3, duration: 120, priority: 2 },
  ];

  const groups = [
    { dept: 'CSE', course: 'BTCSE', semester: 3, count: 10, subjects: ['CS301', 'CS302', 'MA301', 'HS101'] },
    { dept: 'CSE', course: 'BTCSE', semester: 5, count: 8, subjects: ['CS501', 'CS502', 'MA401', 'HS101'] },
    { dept: 'ECE', course: 'BTECE', semester: 3, count: 6, subjects: ['EC301', 'EC302', 'MA301', 'HS101'] },
    { dept: 'ECE', course: 'BTECE', semester: 5, count: 6, subjects: ['EC501', 'CS502', 'MA401', 'HS101'] },
    { dept: 'ME', course: 'BTME', semester: 3, count: 5, subjects: ['ME301', 'MA301', 'HS101'] },
    { dept: 'ME', course: 'BTME', semester: 5, count: 5, subjects: ['ME501', 'MA401', 'HS101'] },
  ];
  const students = [];
  let n = 0;
  groups.forEach((g, gi) => {
    for (let i = 0; i < g.count; i++) {
      const name = NAMES[n];
      const extra = [];
      if (gi === 0 && i < 3) extra.push('EC301');   // cross-department elective
      if (gi === 5 && i < 2) extra.push('EC302');   // cross-department elective
      n++;
      students.push({
        code: `S26${String(n).padStart(3, '0')}`, name,
        email: `${name.toLowerCase().replace(' ', '.')}@meridian.edu`,
        dept: g.dept, course: g.course, semester: g.semester, academic_year: '2026-2027',
        subjects: [...g.subjects, ...extra],
      });
    }
  });

  const faculty = [
    { code: 'F001', name: 'Dr. Anita Sharma', dept: 'CSE', designation: 'Professor', max: 6 },
    { code: 'F002', name: 'Dr. Rajesh Menon', dept: 'CSE', designation: 'Associate Professor', max: 6 },
    { code: 'F003', name: 'Prof. Kavita Iyer', dept: 'CSE', designation: 'Assistant Professor', max: 5 },
    { code: 'F004', name: 'Dr. Suresh Banerjee', dept: 'ECE', designation: 'Professor', max: 6 },
    { code: 'F005', name: 'Dr. Meera Nair', dept: 'ECE', designation: 'Associate Professor', max: 5 },
    { code: 'F006', name: 'Prof. Arvind Kulkarni', dept: 'ME', designation: 'Associate Professor', max: 6 },
    { code: 'F007', name: 'Dr. Pooja Desai', dept: 'ME', designation: 'Assistant Professor', max: 5 },
    { code: 'F008', name: 'Dr. Imran Qureshi', dept: 'MA', designation: 'Professor', max: 6 },
    { code: 'F009', name: 'Prof. Neha Gupta', dept: 'MA', designation: 'Assistant Professor', max: 5 },
    { code: 'F010', name: 'Dr. Sarah Thomas', dept: 'HUM', designation: 'Associate Professor', max: 4 },
  ];
  // Eligible invigilators by subject department (faculty codes). HS101 has none listed -> everyone is eligible.
  const eligibleByDept = {
    CSE: ['F001', 'F002', 'F003', 'F008'],
    ECE: ['F004', 'F005', 'F002', 'F009'],
    ME: ['F006', 'F007', 'F008', 'F010'],
    MA: ['F008', 'F009', 'F001', 'F005', 'F006'],
  };

  const rooms = [
    { code: 'A101', name: 'Room A101', building: 'Block A', floor: 1, capacity: 20, type: 'classroom' },
    { code: 'A102', name: 'Room A102', building: 'Block A', floor: 1, capacity: 30, type: 'lecture_hall' },
    { code: 'B201', name: 'Room B201', building: 'Block B', floor: 2, capacity: 25, type: 'classroom' },
    { code: 'B202', name: 'Room B202', building: 'Block B', floor: 2, capacity: 15, type: 'classroom' },
    { code: 'C301', name: 'Lab C301', building: 'Block C', floor: 3, capacity: 12, type: 'laboratory' },
    { code: 'D001', name: 'Seminar Hall D001', building: 'Block D', floor: 0, capacity: 30, type: 'auditorium' },
  ];

  const period = {
    name: 'Winter Semester Examinations 2026', session_name: 'Winter 2026 End-Semester Examinations',
    academic_year: '2026-2027', start_date: '2026-12-10', end_date: '2026-12-17',
  };
  const templates = [
    { label: 'Morning', start: '09:00:00', end: '12:00:00' },
    { label: 'Afternoon', start: '13:00:00', end: '16:00:00' },
  ];
  const examDates = ['2026-12-10', '2026-12-11', '2026-12-14', '2026-12-15', '2026-12-16', '2026-12-17'];
  const holidayDates = ['2026-12-12', '2026-12-13']; // weekend

  // [date, slot label] pairs that are blocked
  const roomBlocked = {
    B202: [['2026-12-10', 'Morning'], ['2026-12-10', 'Afternoon']],
    C301: [['2026-12-14', 'Afternoon'], ['2026-12-15', 'Afternoon']],
    A101: [['2026-12-16', 'Morning']],
  };
  const facultyBlocked = {
    F001: [['2026-12-10', 'Morning'], ['2026-12-17', 'Afternoon']],
    F002: [['2026-12-11', 'Afternoon']],
    F004: [['2026-12-14', 'Morning'], ['2026-12-14', 'Afternoon']],
    F005: [['2026-12-15', 'Afternoon']],
    F006: [['2026-12-10', 'Afternoon'], ['2026-12-11', 'Morning']],
    F008: [['2026-12-16', 'Morning'], ['2026-12-16', 'Afternoon']],
    F010: [['2026-12-10', 'Morning'], ['2026-12-10', 'Afternoon'], ['2026-12-11', 'Morning'], ['2026-12-11', 'Afternoon']],
  };

  return { departments, courses, subjects, students, faculty, eligibleByDept, rooms, period, templates, examDates, holidayDates, roomBlocked, facultyBlocked };
}

const DATA_TABLES = [
  'optimization_results', 'faculty_invigilator_assignments', 'examination_room_assignments', 'examination_schedules',
  'optimization_runs', 'examinations', 'room_availability', 'faculty_availability', 'time_slots', 'examination_periods',
  'student_enrollments', 'subject_faculty_eligibility', 'subjects', 'students', 'faculty', 'examination_rooms', 'courses', 'departments',
];

/** Removes ALL university data (keeps user accounts and settings). */
async function clearAllData() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of DATA_TABLES) await conn.query(`TRUNCATE TABLE ${t}`);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  } finally {
    conn.release();
  }
}

async function loadDemoDataset() {
  await clearAllData();
  const d = buildDemoDataset();
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const ins = async (sql, params) => (await conn.query(sql, params))[0].insertId;

    const dept = {};
    for (const x of d.departments) dept[x.code] = await ins('INSERT INTO departments (code, name) VALUES (?,?)', [x.code, x.name]);
    const course = {};
    for (const x of d.courses) course[x.code] = await ins('INSERT INTO courses (department_id, code, name) VALUES (?,?,?)', [dept[x.dept], x.code, x.name]);

    const subj = {};
    for (const x of d.subjects) {
      subj[x.code] = await ins(
        'INSERT INTO subjects (code, name, department_id, course_id, semester, duration_minutes, priority) VALUES (?,?,?,?,?,?,?)',
        [x.code, x.name, dept[x.dept], null, x.semester, x.duration, x.priority]);
    }
    const fac = {};
    for (const x of d.faculty) {
      fac[x.code] = await ins(
        'INSERT INTO faculty (faculty_code, name, email, department_id, designation, max_workload) VALUES (?,?,?,?,?,?)',
        [x.code, x.name, `${x.name.toLowerCase().replace(/^(dr|prof)\.\s*/, '').replace(/\s+/g, '.')}@meridian.edu`, dept[x.dept], x.designation, x.max]);
    }
    for (const x of d.subjects) {
      for (const fc of d.eligibleByDept[x.dept] || []) await conn.query('INSERT INTO subject_faculty_eligibility (subject_id, faculty_id) VALUES (?,?)', [subj[x.code], fac[fc]]);
    }

    for (const x of d.students) {
      const sid = await ins(
        'INSERT INTO students (student_code, name, email, department_id, course_id, semester, academic_year) VALUES (?,?,?,?,?,?,?)',
        [x.code, x.name, x.email, dept[x.dept], course[x.course], x.semester, x.academic_year]);
      await conn.query('INSERT INTO student_enrollments (student_id, subject_id) VALUES ?', [x.subjects.map((c) => [sid, subj[c]])]);
    }

    const room = {};
    for (const x of d.rooms) {
      room[x.code] = await ins(
        'INSERT INTO examination_rooms (room_code, name, building, floor, capacity, room_type, status) VALUES (?,?,?,?,?,?,?)',
        [x.code, x.name, x.building, x.floor, x.capacity, x.type, 'available']);
    }

    const periodId = await ins(
      'INSERT INTO examination_periods (name, session_name, academic_year, start_date, end_date, is_active) VALUES (?,?,?,?,?,1)',
      [d.period.name, d.period.session_name, d.period.academic_year, d.period.start_date, d.period.end_date]);
    const slot = {};
    const addSlots = async (dates, holiday) => {
      for (const date of dates) {
        for (const t of d.templates) {
          slot[`${date}|${t.label}`] = await ins(
            'INSERT INTO time_slots (period_id, slot_date, label, start_time, end_time, is_holiday, is_available) VALUES (?,?,?,?,?,?,1)',
            [periodId, date, t.label, t.start, t.end, holiday ? 1 : 0]);
        }
      }
    };
    await addSlots(d.examDates, false);
    await addSlots(d.holidayDates, true);

    for (const [rc, list] of Object.entries(d.roomBlocked)) {
      for (const [date, label] of list) await conn.query('INSERT INTO room_availability (room_id, slot_id, is_available) VALUES (?,?,0)', [room[rc], slot[`${date}|${label}`]]);
    }
    for (const [fc, list] of Object.entries(d.facultyBlocked)) {
      for (const [date, label] of list) await conn.query('INSERT INTO faculty_availability (faculty_id, slot_id, is_available) VALUES (?,?,0)', [fac[fc], slot[`${date}|${label}`]]);
    }

    // one examination event per subject
    for (const x of d.subjects) await conn.query('INSERT INTO examinations (subject_id, period_id, duration_minutes) VALUES (?,?,?)', [subj[x.code], periodId, x.duration]);

    await conn.commit();
    return {
      departments: d.departments.length, courses: d.courses.length, students: d.students.length, faculty: d.faculty.length,
      subjects: d.subjects.length, rooms: d.rooms.length, slots: d.examDates.length * 2 + d.holidayDates.length * 2, examinations: d.subjects.length,
    };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { buildDemoDataset, loadDemoDataset, clearAllData };
