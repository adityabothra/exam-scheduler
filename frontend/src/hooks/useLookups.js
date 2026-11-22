import api from '../services/api';
import useFetch from './useFetch';

/** Departments, courses and subjects used by dropdowns across pages. */
export default function useLookups() {
  const { data, reload } = useFetch(async () => {
    const [departments, courses, subjects] = await Promise.all([api.get('/departments'), api.get('/courses'), api.get('/subjects')]);
    return { departments: departments.data, courses: courses.data, subjects: subjects.data };
  }, [], { silent: true });
  return { departments: data?.departments || [], courses: data?.courses || [], subjects: data?.subjects || [], reload, ready: !!data };
}
