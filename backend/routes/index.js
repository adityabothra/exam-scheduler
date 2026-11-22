const express = require('express');
const multer = require('multer');
const { authenticate } = require('../middleware/authMiddleware');
const auth = require('../controllers/authController');
const lookup = require('../controllers/lookupController');
const student = require('../controllers/studentController');
const faculty = require('../controllers/facultyController');
const room = require('../controllers/roomController');
const subject = require('../controllers/subjectController');
const slot = require('../controllers/timeSlotController');
const avail = require('../controllers/availabilityController');
const exam = require('../controllers/examinationController');
const opt = require('../controllers/optimizationController');
const sched = require('../controllers/scheduleController');
const dash = require('../controllers/dashboardController');
const report = require('../controllers/reportController');
const imp = require('../controllers/importController');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok' }));
router.post('/auth/login', auth.login);

// everything below requires a valid token
router.use(authenticate);
router.get('/auth/me', auth.me);
router.post('/auth/change-password', auth.changePassword);

router.get('/dashboard', dash.stats);
router.get('/settings', dash.systemInfo);
router.put('/settings', dash.updateSettings);
router.post('/demo/load', dash.loadDemo);
router.post('/demo/clear', dash.clearData);

router.route('/departments').get(lookup.listDepartments).post(lookup.createDepartment);
router.route('/departments/:id').put(lookup.updateDepartment).delete(lookup.deleteDepartment);
router.route('/courses').get(lookup.listCourses).post(lookup.createCourse);
router.route('/courses/:id').put(lookup.updateCourse).delete(lookup.deleteCourse);

router.route('/students').get(student.list).post(student.create);
router.post('/students/import', upload.single('file'), student.importCsv);
router.route('/students/:id').get(student.get).put(student.update).delete(student.remove);
router.put('/students/:id/enrollments', student.setEnrollments);

router.route('/faculty').get(faculty.list).post(faculty.create);
router.route('/faculty/:id').get(faculty.get).put(faculty.update).delete(faculty.remove);
router.get('/faculty/:id/schedule', faculty.schedule);

router.route('/rooms').get(room.list).post(room.create);
router.route('/rooms/:id').get(room.get).put(room.update).delete(room.remove);
router.get('/rooms/:id/schedule', room.schedule);

router.route('/subjects').get(subject.list).post(subject.create);
router.route('/subjects/:id').get(subject.get).put(subject.update).delete(subject.remove);
router.put('/subjects/:id/enrollments', subject.setEnrollments);

router.route('/periods').get(slot.listPeriods).post(slot.createPeriod);
router.get('/periods/active', slot.activePeriod);
router.route('/periods/:id').put(slot.updatePeriod).delete(slot.deletePeriod);
router.post('/periods/:id/activate', slot.activatePeriod);
router.route('/slots').get(slot.listSlots).post(slot.createSlot);
router.post('/slots/bulk', slot.bulkCreateSlots);
router.post('/slots/holiday', slot.setHoliday);
router.route('/slots/:id').put(slot.updateSlot).delete(slot.deleteSlot);

router.get('/availability/:type/overview', avail.overview);
router.route('/availability/:type/:id').get(avail.get).put(avail.update);

router.route('/examinations').get(exam.list).post(exam.create);
router.post('/examinations/generate', exam.generate);
router.get('/examinations/feasibility', exam.feasibility);
router.route('/examinations/:id').put(exam.update).delete(exam.remove);

router.route('/optimization/config').get(opt.getConfig).put(opt.saveConfig);
router.post('/optimization/config/reset', opt.resetConfig);
router.get('/optimization/feasibility', opt.feasibility);
router.post('/optimization/start', opt.start);
router.get('/optimization/active', opt.active);
router.get('/optimization/history', opt.history);
router.get('/optimization/compare', opt.compare);
router.get('/optimization/:id/stream', opt.stream);
router.post('/optimization/:id/pause', opt.pause);
router.post('/optimization/:id/resume', opt.resume);
router.post('/optimization/:id/cancel', opt.cancel);
router.route('/optimization/:id').get(opt.getRun).delete(opt.removeRun);

router.get('/schedule/current', sched.current);
router.get('/schedule/complete', sched.complete);
router.get('/schedule/student/:id', sched.student);
router.get('/schedule/faculty/:id', sched.faculty);
router.get('/schedule/room/:id', sched.room);
router.get('/schedule/validate', sched.validateRun);
router.post('/schedule/publish', sched.publish);
router.post('/schedule/unpublish', sched.unpublish);
router.put('/schedule/:runId/exam/:examId', sched.editExam);

router.get('/reports/:type', report.download);

router.get('/import/describe', imp.describe);
router.get('/import/template', imp.template);
router.get('/import/template/:entity', imp.entityTemplate);
router.post('/import/bundle', imp.uploadFile, imp.bundle);
router.post('/import/:entity', imp.uploadFile, imp.entity);

module.exports = router;
