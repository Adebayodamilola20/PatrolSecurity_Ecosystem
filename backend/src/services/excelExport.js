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

// Case-insensitive / casing-agnostic property getter for database compatibility (SQLite vs PostgreSQL)
function getProp(obj, key) {
  if (!obj) return ''
  if (key in obj) return obj[key]
  const lowerKey = key.toLowerCase()
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lowerKey) return obj[k]
  }
  return ''
}

// Numeric case-insensitive getter
function getPropNum(obj, key, fallback = '') {
  if (!obj) return fallback
  if (key in obj) return obj[key] ?? fallback
  const lowerKey = key.toLowerCase()
  for (const k of Object.keys(obj)) {
    if (k.toLowerCase() === lowerKey) return obj[k] ?? fallback
  }
  return fallback
}

function computeShiftMinutes(shift, rangeStartMs, rangeEndMs) {
  const clockIn = getProp(shift, 'clockIn')
  const clockOut = getProp(shift, 'clockOut')
  const startMs = new Date(clockIn).getTime()
  if (Number.isNaN(startMs)) return 0
  const rawEndMs = clockOut ? new Date(clockOut).getTime() : rangeEndMs
  const endMs = Number.isNaN(rawEndMs) ? rangeEndMs : rawEndMs
  const effectiveStart = Math.max(startMs, rangeStartMs)
  const effectiveEnd = Math.min(endMs, rangeEndMs)
  if (effectiveEnd <= effectiveStart) return 0
  return Math.round((effectiveEnd - effectiveStart) / 60000)
}

const thinBorder = {
  top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
}

const stripeFill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF8FAFC' }
}

function applyHeaderStyle(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Segoe UI', size: 11 }
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' }, // Premium Dark Slate
  }
  row.alignment = { vertical: 'middle', horizontal: 'left' }
  row.height = 24
}

function styleRow(row, isStripe = false) {
  row.height = 20
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = thinBorder
    cell.font = { name: 'Segoe UI', size: 10 }
    if (isStripe) {
      cell.fill = stripeFill
    }

    // Proactively highlight status cells
    const val = String(cell.value || '').trim().toLowerCase()
    if (val === 'yes' || val === 'verified' || val === 'active' || val === 'completed') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2F0D9' } } // Soft green
      cell.font = { color: { argb: 'FF385723' }, bold: true, name: 'Segoe UI', size: 10 }
    } else if (val === 'no' || val === 'flagged') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } } // Soft red
      cell.font = { color: { argb: 'FFC00000' }, bold: true, name: 'Segoe UI', size: 10 }
    }
  })
}

function autoSizeColumns(worksheet) {
  worksheet.columns.forEach((column) => {
    let maxLength = 12
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      const value = cell.value == null ? '' : String(cell.value)
      maxLength = Math.max(maxLength, Math.min(40, value.length + 2))
    })
    column.width = maxLength
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
  const verifiedScans = scans.filter((scan) => getProp(scan, 'gpsValid')).length
  const flaggedScans = scans.length - verifiedScans
  const officers = new Set(scans.map((scan) => getProp(scan, 'officerName')).filter(Boolean))
  const checkpoints = new Set(scans.map((scan) => getProp(scan, 'checkpointName')).filter(Boolean))

  const shiftsWithDuration = shifts.map((shift) => {
    const durationMinutes = computeShiftMinutes(shift, range.startMs, range.endMs)
    return {
      ...shift,
      durationMinutes,
      durationLabel: formatDuration(durationMinutes),
    }
  })

  const totalShiftMinutes = shiftsWithDuration.reduce((sum, shift) => sum + shift.durationMinutes, 0)

  // 1. SUMMARY SHEET
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
    { metric: 'Active shifts', value: shiftsWithDuration.filter((shift) => getProp(shift, 'status') === 'active').length },
    { metric: 'Completed shifts', value: shiftsWithDuration.filter((shift) => getProp(shift, 'status') !== 'active').length },
    { metric: 'Total shift hours', value: (totalShiftMinutes / 60).toFixed(2) },
  ])
  summarySheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  summarySheet.eachRow((row, rowNum) => {
    row.height = 20
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = thinBorder
      cell.font = { name: 'Segoe UI', size: 10 }
      if (rowNum > 1) {
        if (cell.col === 1) cell.font = { bold: true, name: 'Segoe UI', size: 10 }
        // highlight total scans / verified scans / flagged scans / total shift hours!
        const metricVal = String(row.getCell(1).value || '')
        if (metricVal.includes('Total scans') || metricVal.includes('Verified') || metricVal.includes('Flagged') || metricVal.includes('Total shift hours')) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } } // Sleek gray highlight
        }
      }
    })
  })
  autoSizeColumns(summarySheet)

  // 2. PATROL SCANS SHEET
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
    const isStripe = scansSheet.rowCount % 2 === 1
    const row = scansSheet.addRow({
      officerName: getProp(scan, 'officerName'),
      officerEmail: getProp(scan, 'officerEmail'),
      officerPhone: getProp(scan, 'officerPhone'),
      checkpointName: getProp(scan, 'checkpointName'),
      checkpointCode: getProp(scan, 'checkpointCode'),
      siteName: getProp(scan, 'siteName'),
      clientName: getProp(scan, 'clientName'),
      scannedAt: formatDateTime(getProp(scan, 'scannedAt')),
      receivedAt: formatDateTime(getProp(scan, 'receivedAt')),
      gpsValid: getProp(scan, 'gpsValid') ? 'Yes' : 'No',
      distanceMeters: getPropNum(scan, 'distanceMeters'),
      gpsLatitude: getPropNum(scan, 'gpsLatitude'),
      gpsLongitude: getPropNum(scan, 'gpsLongitude'),
      notes: getProp(scan, 'notes'),
    })
    styleRow(row, isStripe)
  }
  scansSheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  autoSizeColumns(scansSheet)

  // 3. ATTENDANCE SHEET
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
    const isStripe = shiftsSheet.rowCount % 2 === 1
    const row = shiftsSheet.addRow({
      userName: getProp(shift, 'userName'),
      userEmail: getProp(shift, 'userEmail'),
      userPhone: getProp(shift, 'userPhone'),
      clientName: getProp(shift, 'clientName'),
      clockIn: formatDateTime(getProp(shift, 'clockIn')),
      clockOut: formatDateTime(getProp(shift, 'clockOut')),
      status: getProp(shift, 'status'),
      siteLabel: getProp(shift, 'siteLabel'),
      durationMinutes: shift.durationMinutes,
      durationLabel: shift.durationLabel,
      clockInLatitude: getPropNum(shift, 'clockInLatitude'),
      clockInLongitude: getPropNum(shift, 'clockInLongitude'),
      clockOutLatitude: getPropNum(shift, 'clockOutLatitude'),
      clockOutLongitude: getPropNum(shift, 'clockOutLongitude'),
    })
    styleRow(row, isStripe)
  }
  shiftsSheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }]
  autoSizeColumns(shiftsSheet)

  // 4. CHECKPOINT SUMMARY SHEET
  const checkpointSummary = new Map()
  for (const scan of scans) {
    const cpId = getProp(scan, 'checkpointId')
    const cpName = getProp(scan, 'checkpointName')
    const key = cpId || cpName || 'unknown'
    if (!checkpointSummary.has(key)) {
      checkpointSummary.set(key, {
        checkpointName: cpName || 'Unknown checkpoint',
        checkpointCode: getProp(scan, 'checkpointCode') || '',
        siteName: getProp(scan, 'siteName') || '',
        clientName: getProp(scan, 'clientName') || '',
        totalScans: 0,
        verifiedScans: 0,
        flaggedScans: 0,
        lastScannedAt: '',
      })
    }
    const item = checkpointSummary.get(key)
    item.totalScans += 1
    const gpsValid = getProp(scan, 'gpsValid')
    item.verifiedScans += gpsValid ? 1 : 0
    item.flaggedScans += gpsValid ? 0 : 1
    const scannedAt = getProp(scan, 'scannedAt')
    if (!item.lastScannedAt || new Date(scannedAt).getTime() > new Date(item.lastScannedAt).getTime()) {
      item.lastScannedAt = scannedAt
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
  for (const rowData of checkpointSummary.values()) {
    const isStripe = checkpointSheet.rowCount % 2 === 1
    const row = checkpointSheet.addRow({
      ...rowData,
      lastScannedAt: formatDateTime(rowData.lastScannedAt),
    })
    styleRow(row, isStripe)
  }
  checkpointSheet.views = [{ state: 'frozen', ySplit: 1, showGridLines: true }]
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
