/**
 * Helpers що будують абсолютні URL до сутностей CRM. Tools повертають
 * `url` як окреме поле, AI вирішує куди вставити <a href> у відповідь.
 */
const BASE_URL =
  process.env.NEXTAUTH_URL ||
  process.env.AUTH_URL ||
  'https://www.metrum-grup.biz.ua';

export const urls = {
  task: (taskId: string): string => `${BASE_URL}/admin-v2/me?task=${taskId}`,
  project: (projectId: string): string =>
    `${BASE_URL}/admin-v2/projects/${projectId}`,
  foremanReport: (reportId: string): string =>
    `${BASE_URL}/admin-v2/foreman-reports/${reportId}`,
  financeEntry: (entryId: string): string =>
    `${BASE_URL}/admin-v2/financing?entryId=${entryId}`,
  profile: (): string => `${BASE_URL}/admin-v2/profile`,
};
