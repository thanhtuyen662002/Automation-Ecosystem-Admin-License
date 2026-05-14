/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import LicenseAdminPage from './pages/LicenseAdminPage';

export default function App() {
  const path = window.location.pathname;

  if (path === '/license-admin') {
    return <LicenseAdminPage />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">Automation Ecosystem</h1>
      <a 
        href="/license-admin" 
        className="px-6 py-3 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition"
      >
        Go to License Admin
      </a>
    </div>
  );
}
