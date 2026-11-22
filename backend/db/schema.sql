-- ============================================================================
-- AI-Based University Examination Scheduling and Optimization System
-- Normalized MySQL / MariaDB schema (idempotent: safe to run repeatedly)
--
-- Availability convention: a row in room_availability / faculty_availability
-- with is_available = 0 marks an UNAVAILABLE slot. No row = available.
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(60)  NOT NULL UNIQUE,
  password_hash VARCHAR(100) NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  role          ENUM('admin','staff') NOT NULL DEFAULT 'admin',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS departments (
  id   INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(20)  NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS courses (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  department_id INT NOT NULL,
  code          VARCHAR(20)  NOT NULL UNIQUE,
  name          VARCHAR(120) NOT NULL,
  CONSTRAINT fk_courses_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
  INDEX idx_courses_dept (department_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  student_code  VARCHAR(30)  NOT NULL UNIQUE,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  department_id INT NOT NULL,
  course_id     INT NULL,
  semester      TINYINT NOT NULL,
  academic_year VARCHAR(9) NOT NULL,
  CONSTRAINT fk_students_dept   FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_students_course FOREIGN KEY (course_id)     REFERENCES courses(id)     ON DELETE SET NULL,
  INDEX idx_students_dept_sem (department_id, semester),
  INDEX idx_students_course (course_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS faculty (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  faculty_code  VARCHAR(30)  NOT NULL UNIQUE,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  department_id INT NOT NULL,
  designation   VARCHAR(60)  NOT NULL,
  max_workload  INT NOT NULL DEFAULT 6,
  CONSTRAINT fk_faculty_dept FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  INDEX idx_faculty_dept (department_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subjects (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  code             VARCHAR(20)  NOT NULL UNIQUE,
  name             VARCHAR(150) NOT NULL,
  department_id    INT NOT NULL,
  course_id        INT NULL,
  semester         TINYINT NOT NULL,
  duration_minutes INT NOT NULL DEFAULT 180,
  priority         TINYINT NOT NULL DEFAULT 3,
  CONSTRAINT fk_subjects_dept   FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_subjects_course FOREIGN KEY (course_id)     REFERENCES courses(id)     ON DELETE SET NULL,
  INDEX idx_subjects_dept_sem (department_id, semester)
) ENGINE=InnoDB;

-- Which faculty may invigilate a subject. A subject with NO rows here accepts any faculty.
CREATE TABLE IF NOT EXISTS subject_faculty_eligibility (
  subject_id INT NOT NULL,
  faculty_id INT NOT NULL,
  PRIMARY KEY (subject_id, faculty_id),
  CONSTRAINT fk_sfe_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  CONSTRAINT fk_sfe_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(id)  ON DELETE CASCADE
) ENGINE=InnoDB;

-- Student <-> subject enrolment: the source of every student-clash constraint.
CREATE TABLE IF NOT EXISTS student_enrollments (
  student_id INT NOT NULL,
  subject_id INT NOT NULL,
  PRIMARY KEY (student_id, subject_id),
  CONSTRAINT fk_enr_student FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  CONSTRAINT fk_enr_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE,
  INDEX idx_enr_subject (subject_id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS examination_rooms (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  room_code  VARCHAR(20)  NOT NULL UNIQUE,
  name       VARCHAR(80)  NOT NULL,
  building   VARCHAR(80)  NOT NULL,
  floor      TINYINT NOT NULL DEFAULT 0,
  capacity   INT NOT NULL,
  room_type  ENUM('classroom','lecture_hall','laboratory','auditorium') NOT NULL DEFAULT 'classroom',
  status     ENUM('available','unavailable') NOT NULL DEFAULT 'available',
  CONSTRAINT chk_room_capacity CHECK (capacity > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS examination_periods (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL UNIQUE,
  session_name  VARCHAR(80)  NOT NULL,
  academic_year VARCHAR(9)   NOT NULL,
  start_date    DATE NOT NULL,
  end_date      DATE NOT NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT chk_period_dates CHECK (end_date >= start_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS time_slots (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  period_id    INT NOT NULL,
  slot_date    DATE NOT NULL,
  label        VARCHAR(40) NOT NULL,
  start_time   TIME NOT NULL,
  end_time     TIME NOT NULL,
  is_holiday   TINYINT(1) NOT NULL DEFAULT 0,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_slots_period FOREIGN KEY (period_id) REFERENCES examination_periods(id) ON DELETE CASCADE,
  CONSTRAINT chk_slot_times CHECK (end_time > start_time),
  UNIQUE KEY uq_slot (period_id, slot_date, start_time),
  INDEX idx_slots_date (slot_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS room_availability (
  room_id      INT NOT NULL,
  slot_id      INT NOT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, slot_id),
  CONSTRAINT fk_ra_room FOREIGN KEY (room_id) REFERENCES examination_rooms(id) ON DELETE CASCADE,
  CONSTRAINT fk_ra_slot FOREIGN KEY (slot_id) REFERENCES time_slots(id)        ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS faculty_availability (
  faculty_id   INT NOT NULL,
  slot_id      INT NOT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (faculty_id, slot_id),
  CONSTRAINT fk_fa_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(id)    ON DELETE CASCADE,
  CONSTRAINT fk_fa_slot    FOREIGN KEY (slot_id)    REFERENCES time_slots(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- An examination event = one subject examined within one examination period.
CREATE TABLE IF NOT EXISTS examinations (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  subject_id       INT NOT NULL,
  period_id        INT NOT NULL,
  duration_minutes INT NOT NULL,
  CONSTRAINT fk_exam_subject FOREIGN KEY (subject_id) REFERENCES subjects(id)            ON DELETE CASCADE,
  CONSTRAINT fk_exam_period  FOREIGN KEY (period_id)  REFERENCES examination_periods(id) ON DELETE CASCADE,
  UNIQUE KEY uq_exam (subject_id, period_id),
  CONSTRAINT chk_exam_duration CHECK (duration_minutes > 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS optimization_runs (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  period_id         INT NOT NULL,
  name              VARCHAR(120) NOT NULL,
  status            ENUM('running','paused','completed','failed','cancelled') NOT NULL DEFAULT 'running',
  config            LONGTEXT NOT NULL,
  initial_cost      DOUBLE NULL,
  initial_breakdown LONGTEXT NULL,
  final_cost        DOUBLE NULL,
  final_breakdown   LONGTEXT NULL,
  iterations        INT NOT NULL DEFAULT 0,
  accepted          INT NOT NULL DEFAULT 0,
  rejected          INT NOT NULL DEFAULT 0,
  invalid_neighbors INT NOT NULL DEFAULT 0,
  termination       VARCHAR(40) NULL,
  duration_ms       INT NULL,
  validation_status ENUM('unvalidated','valid','invalid') NOT NULL DEFAULT 'unvalidated',
  is_published      TINYINT(1) NOT NULL DEFAULT 0,
  error_message     TEXT NULL,
  created_by        INT NULL,
  started_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at       TIMESTAMP NULL,
  CONSTRAINT fk_runs_period FOREIGN KEY (period_id)  REFERENCES examination_periods(id) ON DELETE CASCADE,
  CONSTRAINT fk_runs_user   FOREIGN KEY (created_by) REFERENCES users(id)               ON DELETE SET NULL,
  INDEX idx_runs_period (period_id, status)
) ENGINE=InnoDB;

-- One row per examination in a run: the examination's assigned date/time slot.
CREATE TABLE IF NOT EXISTS examination_schedules (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  run_id         INT NOT NULL,
  examination_id INT NOT NULL,
  slot_id        INT NOT NULL,
  CONSTRAINT fk_sched_run  FOREIGN KEY (run_id)         REFERENCES optimization_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_sched_exam FOREIGN KEY (examination_id) REFERENCES examinations(id)      ON DELETE CASCADE,
  CONSTRAINT fk_sched_slot FOREIGN KEY (slot_id)        REFERENCES time_slots(id)        ON DELETE RESTRICT,
  UNIQUE KEY uq_sched (run_id, examination_id),
  INDEX idx_sched_slot (slot_id)
) ENGINE=InnoDB;

-- An examination can occupy several rooms.
CREATE TABLE IF NOT EXISTS examination_room_assignments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT NOT NULL,
  room_id     INT NOT NULL,
  CONSTRAINT fk_era_sched FOREIGN KEY (schedule_id) REFERENCES examination_schedules(id) ON DELETE CASCADE,
  CONSTRAINT fk_era_room  FOREIGN KEY (room_id)     REFERENCES examination_rooms(id)     ON DELETE RESTRICT,
  UNIQUE KEY uq_era (schedule_id, room_id),
  INDEX idx_era_room (room_id)
) ENGINE=InnoDB;

-- An examination can have several invigilators (optionally pinned to one of its rooms).
CREATE TABLE IF NOT EXISTS faculty_invigilator_assignments (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  schedule_id INT NOT NULL,
  faculty_id  INT NOT NULL,
  room_id     INT NULL,
  CONSTRAINT fk_fia_sched   FOREIGN KEY (schedule_id) REFERENCES examination_schedules(id) ON DELETE CASCADE,
  CONSTRAINT fk_fia_faculty FOREIGN KEY (faculty_id)  REFERENCES faculty(id)               ON DELETE RESTRICT,
  CONSTRAINT fk_fia_room    FOREIGN KEY (room_id)     REFERENCES examination_rooms(id)     ON DELETE SET NULL,
  UNIQUE KEY uq_fia (schedule_id, faculty_id),
  INDEX idx_fia_faculty (faculty_id)
) ENGINE=InnoDB;

-- Heavy per-run payloads (convergence series, activity log, initial solution, reports).
CREATE TABLE IF NOT EXISTS optimization_results (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  run_id           INT NOT NULL UNIQUE,
  series           LONGTEXT NULL,
  logs             LONGTEXT NULL,
  initial_solution LONGTEXT NULL,
  report           LONGTEXT NULL,
  CONSTRAINT fk_res_run FOREIGN KEY (run_id) REFERENCES optimization_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key   VARCHAR(80) PRIMARY KEY,
  setting_value TEXT NOT NULL
) ENGINE=InnoDB;
