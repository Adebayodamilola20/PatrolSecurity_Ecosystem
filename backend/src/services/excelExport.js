import fs from 'fs/promises'
import path from 'path'
import ExcelJS from 'exceljs'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const exportsRoot = path.join(__dirname, '..', '..', 'exports', 'daily')

function formatDateTime(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString()
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m'
  const hours = Math.floor(minutes / 60)
  const remainder = Math.round(minutes % 60)
  if (hours <= 0) return `${remainder}m`
  if (remainder <= 0) return `${hours}h`
  return `${hours}h ${remainder}m`
}

function computeShiftMinutes(shift, rangeStartMs, rangeEndMs) {
  const startMs = new Date(shift.clockIn).getTime()
  if (Number.isNaN(startMs)) return 0
  const rawEndMs = shift.clockOut ? new Date(shift.clockOut).getTime() : rangeEndMs
  const endMs = Number.isNaN(rawEndMs) ? rangeEndMs : rawEndMs
  const effectiveStart = Math.max(startMs, rangeStartMs)
  const effectiveEnd = Math.min(endMs, rangeEndMs)
  if (effectiveEnd <= effectiveStart) return 0
  return Math.round((effectiveEnd - effectiveStart) / 60000)
}

function applyHeaderStyle(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E78' },
  }
  row.alignment = { vertical: 'middle' }
}

function autoSizeColumns(worksheet) {
  worksheet.columns = worksheet.columns.map((column) => {
    let maxLength = 12
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value == null ? '' : String(cell.value)
      maxLength = Math.max(maxLength, Math.min(40, value.length + 2))
    })
    return {
      ...column,
      width: maxLength,
    }
  })
}

export function buildDayRange(date) {
  const start = new Date(`${date}T00:00:00`)
  const end = new Date(`${date}T23:59:59.999`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.')
  }
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    startMs: start.getTime(),
    endMs: end.getTime(),
  }
}

export async function createDailyExportWorkbook({
  date,
  requestedBy,
  scans,
  shifts,
  scopeLabel = 'All clients',
}) {
  await fs.mkdir(exportsRoot, { recursive: true })

  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Patrol Monitoring Backend'
  workbook.lastModifiedBy = requestedBy?.name || requestedBy?.email || 'System'
  workbook.created = new Date()
  workbook.modified = new Date()
  workbook.subject = `Daily Patrol Export for ${date}`
  workbook.title = `Daily Patrol Export ${date}`
  workbook.company = 'Patrol Monitoring'

  const range = buildDayRange(date)
  const verifiedScans = scans.filter((scan) => scan.gpsValid).length
  const flaggedScans = scans.length - verifiedScans
  const officers = new Set(scans.map((scan) => scan.officerName).filter(Boolean))
  const checkpoints = new Set(scans.map((scan) => scan.checkpointName).filter(Boolean))

  const shiftsWithDuration = shifts.map((shift) => {
    const durationMinutes = computeShiftMinutes(shift, range.startMs, range.endMs)
    return {
      ...shift,
      durationMinutes,
      durationLabel: formatDuration(durationMinutes),
    }
  })

  const totalShiftMinutes = shiftsWithDuration.reduce((sum, shift) => sum + shift.durationMinutes, 0)

  const summarySheet = workbook.addWorksheet('Summary')
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 28 },
    { header: 'Value', key: 'value', width: 32 },
  ]
  applyHeaderStyle(summarySheet.getRow(1))
  summarySheet.addRows([
    { metric: 'Export date', value: date },
    { metric: 'Generated at', value: formatDateTime(new Date().toISOString()) },
    { metric: 'Requested by', value: requestedBy?.name || requestedBy?.email || 'Unknown user' },
    { metric: 'Scope', value: scopeLabel },
    { metric: 'Total scans', value: scans.length },
    { metric: 'Verified scans', value: verifiedScans },
    { metric: 'Flagged scans', value: flaggedScans },
    { metric: 'Unique officers', value: officers.size },
    { metric: 'Unique checkpoints', value: checkpoints.size },
    { metric: 'Total shifts overlapping day', value: shiftsWithDuration.length },
    { metric: 'Active shifts', value: shiftsWithDuration.filter((shift) => shift.status === 'active').length },
    { metric: 'Completed shifts', value: shiftsWithDuration.filter((shift) => shift.status !== 'active').length },
    { metric: 'Total shift hours', value: (totalShiftMinutes / 60).toFixed(2) },
  ])
  summarySheet.views = [{ state: 'frozen', ySplit: 1 }]
  autoSizeColumns(summarySheet)

  const scansSheet = workbook.addWorksheet('Patrol Scans')
  scansSheet.columns = [
    { header: 'Officer', key: 'officerName' },
    { header: 'Officer Email', key: 'officerEmail' },
    { header: 'Officer Phone', key: 'officerPhone' },
    { header: 'Checkpoint', key: 'checkpointName' },
    { header: 'Checkpoint Code', key: 'checkpointCode' },
    { header: 'Site', key: 'siteName' },
    { header: 'Client', key: 'clientName' },
    { header: 'Scanned At', key: 'scannedAt' },
    { header: 'Received At', key: 'receivedAt' },
    { header: 'GPS Valid', key: 'gpsValid' },
    { header: 'Distance (m)', key: 'distanceMeters' },
    { header: 'Latitude', key: 'gpsLatitude' },
    { header: 'Longitude', key: 'gpsLongitude' },
    { header: 'Notes', key: 'notes' },
  ]
  applyHeaderStyle(scansSheet.getRow(1))
  for (const scan of scans) {
    scansSheet.addRow({
      officerName: scan.officerName || '',
      officerEmail: scan.officerEmail || '',
      officerPhone: scan.officerPhone || '',
      checkpointName: scan.checkpointName || '',
      checkpointCode: scan.checkpointCode || '',
      siteName: scan.siteName || '',
      clientName: scan.clientName || '',
      scannedAt: formatDateTime(scan.scannedAt),
      receivedAt: formatDateTime(scan.receivedAt),
      gpsValid: scan.gpsValid ? 'Yes' : 'No',
      distanceMeters: scan.distanceMeters ?? '',
      gpsLatitude: scan.gpsLatitude ?? '',
      gpsLongitude: scan.gpsLongitude ?? '',
      notes: scan.notes || '',
    })
  }
  scansSheet.views = [{ state: 'frozen', ySplit: 1 }]
  autoSizeColumns(scansSheet)

  const shiftsSheet = workbook.addWorksheet('Attendance')
  shiftsSheet.columns = [
    { header: 'Officer', key: 'userName' },
    { header: 'Email', key: 'userEmail' },
    { header: 'Phone', key: 'userPhone' },
    { header: 'Client', key: 'clientName' },
    { header: 'Clock In', key: 'clockIn' },
    { header: 'Clock Out', key: 'clockOut' },
    { header: 'Status', key: 'status' },
    { header: 'Site Label', key: 'siteLabel' },
    { header: 'Duration (mins)', key: 'durationMinutes' },
    { header: 'Duration', key: 'durationLabel' },
    { header: 'Clock In Lat', key: 'clockInLatitude' },
    { header: 'Clock In Lng', key: 'clockInLongitude' },
    { header: 'Clock Out Lat', key: 'clockOutLatitude' },
    { header: 'Clock Out Lng', key: 'clockOutLongitude' },
  ]
  applyHeaderStyle(shiftsSheet.getRow(1))
  for (const shift of shiftsWithDuration) {
    shiftsSheet.addRow({
      userName: shift.userName || '',
      userEmail: shift.userEmail || '',
      userPhone: shift.userPhone || '',
      clientName: shift.clientName || '',
      clockIn: formatDateTime(shift.clockIn),
      clockOut: formatDateTime(shift.clockOut),
      status: shift.status || '',
      siteLabel: shift.siteLabel || '',
      durationMinutes: shift.durationMinutes,
      durationLabel: shift.durationLabel,
      clockInLatitude: shift.clockInLatitude ?? '',
      clockInLongitude: shift.clockInLongitude ?? '',
      clockOutLatitude: shift.clockOutLatitude ?? '',
      clockOutLongitude: shift.clockOutLongitude ?? '',
    })
  }
  shiftsSheet.views = [{ state: 'frozen', ySplit: 1 }]
  autoSizeColumns(shiftsSheet)

  const checkpointSummary = new Map()
  for (const scan of scans) {
    const key = scan.checkpointId || scan.checkpointName || 'unknown'
    if (!checkpointSummary.has(key)) {
      checkpointSummary.set(key, {
        checkpointName: scan.checkpointName || 'Unknown checkpoint',
        checkpointCode: scan.checkpointCode || '',
        siteName: scan.siteName || '',
        clientName: scan.clientName || '',
        totalScans: 0,
        verifiedScans: 0,
        flaggedScans: 0,
        lastScannedAt: '',
      })
    }
    const item = checkpointSummary.get(key)
    item.totalScans += 1
    item.verifiedScans += scan.gpsValid ? 1 : 0
    item.flaggedScans += scan.gpsValid ? 0 : 1
    if (!item.lastScannedAt || new Date(scan.scannedAt).getTime() > new Date(item.lastScannedAt).getTime()) {
      item.lastScannedAt = scan.scannedAt
    }
  }

  const checkpointSheet = workbook.addWorksheet('Checkpoint Summary')
  checkpointSheet.columns = [
    { header: 'Checkpoint', key: 'checkpointName' },
    { header: 'Code', key: 'checkpointCode' },
    { header: 'Site', key: 'siteName' },
    { header: 'Client', key: 'clientName' },
    { header: 'Total Scans', key: 'totalScans' },
    { header: 'Verified', key: 'verifiedScans' },
    { header: 'Flagged', key: 'flaggedScans' },
    { header: 'Last Scan', key: 'lastScannedAt' },
  ]
  applyHeaderStyle(checkpointSheet.getRow(1))
  for (const row of checkpointSummary.values()) {
    checkpointSheet.addRow({
      ...row,
      lastScannedAt: formatDateTime(row.lastScannedAt),
    })
  }
  checkpointSheet.views = [{ state: 'frozen', ySplit: 1 }]
  autoSizeColumns(checkpointSheet)

  const safeScope = scopeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'all-clients'
  const fileName = `daily-tour-${date}-${safeScope}-${Date.now()}.xlsx`
  const filePath = path.join(exportsRoot, fileName)
  await workbook.xlsx.writeFile(filePath)

  return {
    fileName,
    filePath,
    downloadUrl: `/exports/daily/${fileName}`,
    totals: {
      scans: scans.length,
      verifiedScans,
      flaggedScans,
      shifts: shiftsWithDuration.length,
      totalShiftHours: Number((totalShiftMinutes / 60).toFixed(2)),
    },
  }
}
