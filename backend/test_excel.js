import { createDailyExportWorkbook } from './src/services/excelExport.js';

async function test() {
  console.log('Testing createDailyExportWorkbook with casing mix (camelCase and lowercase)...');
  try {
    const result = await createDailyExportWorkbook({
      date: '2026-05-21',
      requestedBy: { name: 'Test User', email: 'test@securecorp.com' },
      scans: [
        {
          officerName: 'John Doe',
          officerEmail: 'john@securecorp.com',
          officerPhone: '12345678',
          checkpointName: 'Main Gate',
          checkpointCode: 'MG-001',
          siteName: 'HQ Lagos',
          clientName: 'SecureCorp',
          scannedAt: new Date().toISOString(),
          receivedAt: new Date().toISOString(),
          gpsValid: true,
          distanceMeters: 5,
          gpsLatitude: 6.5244,
          gpsLongitude: 3.3792,
          notes: 'All clear'
        },
        {
          // Postgres style lowercase keys
          officername: 'Jane Smith',
          officeremail: 'jane@securecorp.com',
          officerphone: '87654321',
          checkpointname: 'Back Gate',
          checkpointcode: 'BG-002',
          sitename: 'HQ Lagos',
          clientname: 'SecureCorp',
          scannedat: new Date().toISOString(),
          receivedat: new Date().toISOString(),
          gpsvalid: false,
          distancemeters: 120,
          gpslatitude: 6.5245,
          gpslongitude: 3.3793,
          notes: 'Too far (lowercase)'
        }
      ],
      shifts: [
        {
          // Postgres style lowercase keys for shift
          username: 'John Doe',
          useremail: 'john@securecorp.com',
          userphone: '12345678',
          clientname: 'SecureCorp',
          clockin: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
          clockout: new Date().toISOString(),
          status: 'completed',
          sitelabel: 'HQ Lagos',
          clockinlatitude: 6.5244,
          clockinlongitude: 3.3792,
          clockoutlatitude: 6.5244,
          clockoutlongitude: 3.3792
        }
      ],
      scopeLabel: 'SecureCorp'
    });
    console.log('Result:', result);
  } catch (error) {
    console.error('Error generating workbook:', error);
  }
}

test();

