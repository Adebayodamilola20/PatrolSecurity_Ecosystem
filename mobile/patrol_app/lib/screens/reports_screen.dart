import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/checkpoint.dart';
import '../models/export_file.dart';
import '../providers/auth_provider.dart';
import '../providers/scan_provider.dart';
import '../providers/shift_provider.dart';
import '../services/api_service.dart';
import '../utils/app_time.dart';
import '../utils/constants.dart';
import '../utils/theme.dart';

class ReportsScreen extends StatefulWidget {
  final int? initialTab;

  const ReportsScreen({super.key, this.initialTab});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  bool _submitting = false;
  bool _exportsLoading = false;
  String _statusMessage = '';
  // Seeded from the Nigerian date, not the device's: near midnight a handset on
  // another timezone would default the export to the wrong day. The picked value
  // is a wall-clock date from here on, so it is formatted without conversion.
  DateTime _exportDate = AppTime.todayInLagos();
  List<ExportFile> _dailyExports = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ScanProvider>().loadCheckpoints();
      _loadDailyExports();
    });
  }

  Future<void> _submit(
    Future<Map<String, dynamic>> Function() action,
    String successMessage,
  ) async {
    setState(() => _submitting = true);
    try {
      await action();
      if (!mounted) return;
      setState(() => _statusMessage = successMessage);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(successMessage),
          backgroundColor: AppTheme.verified,
        ),
      );
    } catch (e) {
      if (!mounted) return;
      final message = e.toString().replaceFirst('Exception: ', '');
      setState(() => _statusMessage = message);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(message), backgroundColor: AppTheme.error),
      );
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  Future<void> _pickExportDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _exportDate,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() => _exportDate = picked);
    }
  }

  Future<void> _loadDailyExports() async {
    setState(() => _exportsLoading = true);
    try {
      final data = await ApiService.getDailyTourExports();
      if (!mounted) return;
      setState(() {
        _dailyExports = data
            .map((item) => ExportFile.fromJson(item as Map<String, dynamic>))
            .toList();
      });
    } catch (_) {
      if (!mounted) return;
    } finally {
      if (mounted) {
        setState(() => _exportsLoading = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final shift = context.watch<ShiftProvider>();
    final scan = context.watch<ScanProvider>();
    final checkpoints = scan.checkpoints;
    final exportLabel = DateFormat('MMM d, yyyy').format(_exportDate);
    final role = auth.user?.role ?? '';
    final canExport = _canExport(role);

    return DefaultTabController(
      length: 6,
      initialIndex: widget.initialTab ?? 0,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Reports & Control'),
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: 'Daily Activity'),
              Tab(text: 'Incident'),
              Tab(text: 'Parking'),
              Tab(text: 'Maintenance'),
              Tab(text: 'Pass-On Log'),
              Tab(text: 'Custom'),
            ],
          ),
        ),
        body: Column(
          children: [
            Container(
              width: double.infinity,
              margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.border),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Signed in as ${auth.user?.role ?? 'officer'}',
                    style: const TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppTheme.text,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    (shift.siteLabel ?? '').isNotEmpty
                        ? 'Current site: ${shift.siteLabel}'
                        : 'No active site has been attached to this shift yet.',
                    style: const TextStyle(color: AppTheme.textSecondary),
                  ),
                  if (_statusMessage.isNotEmpty) ...[
                    const SizedBox(height: 10),
                    Text(
                      _statusMessage,
                      style: const TextStyle(
                        color: AppTheme.primaryDark,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _DailyActivityTab(
                    checkpoints: checkpoints,
                    busy: _submitting,
                    canExport: canExport,
                    onSubmit: (summary, activities, issues, checkpointId) {
                      final shiftWindow = _buildShiftWindow(shift);
                      return _submit(
                        () => ApiService.submitDailyActivityReport(
                          summary: summary,
                          activities: activities,
                          openIssues: issues,
                          siteLabel: shift.siteLabel ?? '',
                          checkpointId: checkpointId,
                          shiftWindow: shiftWindow,
                        ),
                        'Daily activity report submitted.',
                      );
                    },
                    onRequestExport: () {
                      return _submit(() async {
                        final result = await ApiService.requestDailyTourExport(
                          date: DateFormat('yyyy-MM-dd').format(_exportDate),
                        );
                        await _loadDailyExports();
                        return result;
                      }, 'CSV export requested for $exportLabel.');
                    },
                    exportLabel: exportLabel,
                    onPickExportDate: _pickExportDate,
                    exports: _dailyExports,
                    exportsLoading: _exportsLoading,
                  ),
                  _IncidentTab(
                    checkpoints: checkpoints,
                    busy: _submitting,
                    onSubmit:
                        (
                          title,
                          description,
                          checkpointId,
                          severity,
                          category,
                          photos,
                        ) {
                          return _submit(
                            () => ApiService.reportIncident(
                              title: title,
                              description: description,
                              checkpointId: checkpointId,
                              severity: severity,
                              category: category,
                              photos: photos,
                            ),
                            'Incident report submitted.',
                          );
                        },
                  ),
                  _ParkingViolationTab(
                    checkpoints: checkpoints,
                    busy: _submitting,
                    onSubmit: (plate, vehicle, location, notes, checkpointId) {
                      return _submit(
                        () => ApiService.reportIncident(
                          title: 'Parking Violation: $plate',
                          description:
                              'Vehicle: $vehicle\nLocation: $location\nNotes: $notes',
                          checkpointId: checkpointId,
                          severity: 'low',
                        ),
                        'Parking violation submitted.',
                      );
                    },
                  ),
                  _MaintenanceTab(
                    checkpoints: checkpoints,
                    busy: _submitting,
                    onSubmit:
                        (
                          title,
                          issue,
                          assetName,
                          checkpointId,
                          severity,
                          evidence,
                        ) {
                          return _submit(
                            () => ApiService.submitMaintenanceReport(
                              title: title,
                              issue: issue,
                              assetName: assetName,
                              checkpointId: checkpointId,
                              severity: severity,
                              evidence: evidence,
                            ),
                            'Maintenance report submitted.',
                          );
                        },
                  ),
                  _PassOnLogTab(
                    checkpoints: checkpoints,
                    busy: _submitting,
                    onSubmit: (title, instruction, checkpointId, priority) {
                      return _submit(
                        () => ApiService.submitPassOnLog(
                          title: title,
                          instruction: instruction,
                          checkpointId: checkpointId,
                          priority: priority,
                          siteLabel: shift.siteLabel ?? '',
                        ),
                        'Pass-on log created.',
                      );
                    },
                  ),
                  _CustomReportTab(
                    checkpoints: checkpoints,
                    busy: _submitting,
                    onSubmit: (type, title, details, checkpointId) {
                      return _submit(
                        () => ApiService.reportIncident(
                          title: '$type: $title',
                          description: details,
                          checkpointId: checkpointId,
                          severity: 'medium',
                        ),
                        'Custom report submitted.',
                      );
                    },
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _buildShiftWindow(ShiftProvider shift) {
    final start = shift.clockInTime == null
        ? '--:--'
        : AppTime.time24(shift.clockInTime!);
    final end = shift.scheduledEnd == null
        ? '--:--'
        : AppTime.time24(shift.scheduledEnd!);
    return '$start - $end';
  }

  bool _canExport(String role) {
    final normalized = role.trim().toLowerCase().replaceAll('_', ' ');
    return normalized == 'admin' ||
        normalized.contains('main account') ||
        normalized.contains('client main');
  }
}

class _DailyActivityTab extends StatefulWidget {
  final List<Checkpoint> checkpoints;
  final bool busy;
  final bool canExport;
  final Future<void> Function(String, String, String, String?) onSubmit;
  final Future<void> Function() onRequestExport;
  final String exportLabel;
  final Future<void> Function() onPickExportDate;
  final List<ExportFile> exports;
  final bool exportsLoading;

  const _DailyActivityTab({
    required this.checkpoints,
    required this.busy,
    required this.canExport,
    required this.onSubmit,
    required this.onRequestExport,
    required this.exportLabel,
    required this.onPickExportDate,
    required this.exports,
    required this.exportsLoading,
  });

  @override
  State<_DailyActivityTab> createState() => _DailyActivityTabState();
}

class _DailyActivityTabState extends State<_DailyActivityTab> {
  final _summaryCtrl = TextEditingController();
  final _activitiesCtrl = TextEditingController();
  final _issuesCtrl = TextEditingController();
  String? _checkpointId;

  @override
  void dispose() {
    _summaryCtrl.dispose();
    _activitiesCtrl.dispose();
    _issuesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _SectionTitle(
          title: 'Daily Activity Report',
          description:
              'Summarise the shift, key patrols, and unresolved items.',
        ),
        _CheckpointField(
          checkpoints: widget.checkpoints,
          value: _checkpointId,
          onChanged: (value) => setState(() => _checkpointId = value),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _summaryCtrl,
          onChanged: (_) => setState(() {}),
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Shift summary *',
            hintText: 'How did the shift go overall?',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _activitiesCtrl,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Patrol activities',
            hintText: 'List the major rounds, checks, and findings.',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _issuesCtrl,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Open issues',
            hintText: 'What still needs follow-up?',
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: widget.busy || _summaryCtrl.text.trim().isEmpty
              ? null
              : () => widget.onSubmit(
                  _summaryCtrl.text.trim(),
                  _activitiesCtrl.text.trim(),
                  _issuesCtrl.text.trim(),
                  _checkpointId,
                ),
          icon: const Icon(Icons.description_outlined),
          label: Text(widget.busy ? 'Submitting...' : 'Submit Daily Report'),
        ),
        if (widget.canExport) ...[
          const SizedBox(height: 24),
          const _SectionTitle(
            title: 'CSV Export',
            description:
                'Generate and review the day’s tour export in spreadsheet format.',
          ),
          OutlinedButton.icon(
            onPressed: widget.busy ? null : widget.onPickExportDate,
            icon: const Icon(Icons.calendar_month_outlined),
            label: Text('Export date: ${widget.exportLabel}'),
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: widget.busy ? null : widget.onRequestExport,
            icon: const Icon(Icons.download_outlined),
            label: Text(widget.busy ? 'Requesting...' : 'Request CSV Export'),
          ),
          const SizedBox(height: 16),
          if (widget.exportsLoading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (widget.exports.isEmpty)
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.border),
              ),
              child: const Text(
                'No CSV exports have been generated yet.',
                style: TextStyle(color: AppTheme.textSecondary),
              ),
            )
          else
            ...widget.exports.map((item) => _ExportArchiveCard(item: item)),
        ] else ...[
          const SizedBox(height: 24),
          const _SectionTitle(
            title: 'CSV Export',
            description:
                'Accessible only to Admin and Client Main Account users.',
          ),
        ],
      ],
    );
  }
}

class _ExportArchiveCard extends StatelessWidget {
  final ExportFile item;

  const _ExportArchiveCard({required this.item});

  @override
  Widget build(BuildContext context) {
    final generated = item.generatedAt ?? item.createdAt;
    final generatedLabel = generated == null
        ? 'Unknown time'
        : AppTime.dateTime(generated);
    final fullDownloadUrl = item.downloadUrl.startsWith('http')
        ? item.downloadUrl
        : baseUrl.replaceFirst('/api/v1', '') + item.downloadUrl;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  item.scopeLabel.isNotEmpty
                      ? item.scopeLabel
                      : 'Patrol Export',
                  style: const TextStyle(
                    fontWeight: FontWeight.w700,
                    fontSize: 16,
                    color: AppTheme.text,
                  ),
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 10,
                  vertical: 6,
                ),
                decoration: BoxDecoration(
                  color: AppTheme.primary.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                ),
                child: Text(
                  item.status.toUpperCase(),
                  style: const TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: AppTheme.primary,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '${item.date} • ${item.fileName}',
            style: const TextStyle(color: AppTheme.textSecondary, height: 1.4),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 16,
            runSpacing: 8,
            children: [
              _ExportMetric(label: 'Scans', value: '${item.totals.scans}'),
              _ExportMetric(
                label: 'Verified',
                value: '${item.totals.verifiedScans}',
              ),
              _ExportMetric(label: 'Shifts', value: '${item.totals.shifts}'),
              _ExportMetric(
                label: 'Hours',
                value: item.totals.totalShiftHours.toStringAsFixed(1),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Generated: $generatedLabel',
            style: const TextStyle(fontSize: 12, color: AppTheme.textSecondary),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: () async {
                    final uri = Uri.tryParse(fullDownloadUrl);
                    var opened = false;
                    if (uri != null) {
                      opened = await launchUrl(
                        uri,
                        mode: LaunchMode.externalApplication,
                      );
                    }
                    if (!opened) {
                      await Clipboard.setData(
                        ClipboardData(text: fullDownloadUrl),
                      );
                    }
                    if (!context.mounted) return;
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(
                        content: Text(
                          opened
                              ? 'Opening export download link.'
                              : 'Could not open automatically. Link copied to clipboard.',
                        ),
                      ),
                    );
                  },
                  icon: const Icon(Icons.download_outlined),
                  label: const Text('Open Export'),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _ExportMetric extends StatelessWidget {
  final String label;
  final String value;

  const _ExportMetric({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: const TextStyle(
            fontSize: 11,
            fontWeight: FontWeight.w600,
            color: AppTheme.textSecondary,
          ),
        ),
        const SizedBox(height: 2),
        Text(
          value,
          style: const TextStyle(
            fontSize: 15,
            fontWeight: FontWeight.w700,
            color: AppTheme.text,
          ),
        ),
      ],
    );
  }
}

class _IncidentTab extends StatefulWidget {
  final List<Checkpoint> checkpoints;
  final bool busy;
  final Future<void> Function(
    String,
    String,
    String?,
    String,
    String,
    List<File>,
  )
  onSubmit;

  const _IncidentTab({
    required this.checkpoints,
    required this.busy,
    required this.onSubmit,
  });

  @override
  State<_IncidentTab> createState() => _IncidentTabState();
}

const _incidentCategories = [
  'Security Incident',
  'Theft',
  'Fire',
  'Medical',
  'Visitor Issue',
  'Suspicious Activity',
  'Other',
];

class _IncidentTabState extends State<_IncidentTab> {
  final _titleCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  final _picker = ImagePicker();
  String? _checkpointId;
  String _severity = 'low';
  String _category = 'Security Incident';
  final List<XFile> _photos = [];

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descriptionCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final picked = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 80,
      maxWidth: 1600,
      maxHeight: 1600,
    );
    if (picked != null) {
      setState(() => _photos.add(picked));
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _SectionTitle(
          title: 'Incident Report',
          description:
              'Raise security, safety, or escalation issues immediately.',
        ),
        _CheckpointField(
          checkpoints: widget.checkpoints,
          value: _checkpointId,
          onChanged: (value) => setState(() => _checkpointId = value),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _category,
          decoration: const InputDecoration(labelText: 'Category'),
          items: _incidentCategories
              .map(
                (value) => DropdownMenuItem(value: value, child: Text(value)),
              )
              .toList(),
          onChanged: (value) =>
              setState(() => _category = value ?? 'Security Incident'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _titleCtrl,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'Title *',
            hintText: 'Suspicious movement near gate',
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _severity,
          decoration: const InputDecoration(labelText: 'Severity'),
          items: const ['low', 'medium', 'high', 'critical']
              .map(
                (value) => DropdownMenuItem(value: value, child: Text(value)),
              )
              .toList(),
          onChanged: (value) => setState(() => _severity = value ?? 'low'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _descriptionCtrl,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Description',
            hintText: 'What happened, where, and who was involved?',
          ),
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: _pickPhoto,
          icon: const Icon(Icons.camera_alt_outlined),
          label: Text(
            _photos.isEmpty
                ? 'Attach photos (optional)'
                : '${_photos.length} photo(s) selected',
          ),
        ),
        if (_photos.isNotEmpty) ...[
          const SizedBox(height: 8),
          SizedBox(
            height: 80,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _photos.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                return Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.file(
                        File(_photos[index].path),
                        width: 80,
                        height: 80,
                        fit: BoxFit.cover,
                      ),
                    ),
                    Positioned(
                      top: 0,
                      right: 0,
                      child: GestureDetector(
                        onTap: () => setState(() => _photos.removeAt(index)),
                        child: Container(
                          decoration: const BoxDecoration(
                            color: Colors.red,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.close,
                            size: 16,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: widget.busy || _titleCtrl.text.trim().isEmpty
              ? null
              : () => widget.onSubmit(
                  _titleCtrl.text.trim(),
                  _descriptionCtrl.text.trim(),
                  _checkpointId,
                  _severity,
                  _category,
                  _photos.map((x) => File(x.path)).toList(),
                ),
          icon: const Icon(Icons.warning_amber_rounded),
          label: Text(widget.busy ? 'Submitting...' : 'Submit Incident'),
        ),
      ],
    );
  }
}

class _MaintenanceTab extends StatefulWidget {
  final List<Checkpoint> checkpoints;
  final bool busy;
  final Future<void> Function(
    String,
    String,
    String,
    String?,
    String,
    List<File>,
  )
  onSubmit;

  const _MaintenanceTab({
    required this.checkpoints,
    required this.busy,
    required this.onSubmit,
  });

  @override
  State<_MaintenanceTab> createState() => _MaintenanceTabState();
}

class _MaintenanceTabState extends State<_MaintenanceTab> {
  final _titleCtrl = TextEditingController();
  final _issueCtrl = TextEditingController();
  final _assetCtrl = TextEditingController();
  final _picker = ImagePicker();
  String? _checkpointId;
  String _severity = 'medium';
  final List<XFile> _evidence = [];

  @override
  void dispose() {
    _titleCtrl.dispose();
    _issueCtrl.dispose();
    _assetCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickPhoto() async {
    final picked = await _picker.pickImage(
      source: ImageSource.camera,
      imageQuality: 80,
      maxWidth: 1600,
      maxHeight: 1600,
    );
    if (picked != null) {
      setState(() => _evidence.add(picked));
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _SectionTitle(
          title: 'Maintenance Report',
          description:
              'Log failed bulbs, damaged equipment, and facility faults.',
        ),
        _CheckpointField(
          checkpoints: widget.checkpoints,
          value: _checkpointId,
          onChanged: (value) => setState(() => _checkpointId = value),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _titleCtrl,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'Report title *',
            hintText: 'Generator panel not powering floodlight',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _assetCtrl,
          decoration: const InputDecoration(
            labelText: 'Affected equipment / area',
            hintText: 'Floodlight, main gate lock, CCTV 04...',
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _severity,
          decoration: const InputDecoration(labelText: 'Priority'),
          items: const ['low', 'medium', 'high']
              .map(
                (value) => DropdownMenuItem(value: value, child: Text(value)),
              )
              .toList(),
          onChanged: (value) => setState(() => _severity = value ?? 'medium'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _issueCtrl,
          onChanged: (_) => setState(() {}),
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Issue details *',
            hintText: 'Describe the fault and any immediate risk.',
          ),
        ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: _pickPhoto,
          icon: const Icon(Icons.camera_alt_outlined),
          label: Text(
            _evidence.isEmpty
                ? 'Attach evidence photos (optional)'
                : '${_evidence.length} photo(s) selected',
          ),
        ),
        if (_evidence.isNotEmpty) ...[
          const SizedBox(height: 8),
          SizedBox(
            height: 80,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _evidence.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, index) {
                return Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(8),
                      child: Image.file(
                        File(_evidence[index].path),
                        width: 80,
                        height: 80,
                        fit: BoxFit.cover,
                      ),
                    ),
                    Positioned(
                      top: 0,
                      right: 0,
                      child: GestureDetector(
                        onTap: () => setState(() => _evidence.removeAt(index)),
                        child: Container(
                          decoration: const BoxDecoration(
                            color: Colors.red,
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(
                            Icons.close,
                            size: 16,
                            color: Colors.white,
                          ),
                        ),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed:
              widget.busy ||
                  _titleCtrl.text.trim().isEmpty ||
                  _issueCtrl.text.trim().isEmpty
              ? null
              : () => widget.onSubmit(
                  _titleCtrl.text.trim(),
                  _issueCtrl.text.trim(),
                  _assetCtrl.text.trim(),
                  _checkpointId,
                  _severity,
                  _evidence.map((x) => File(x.path)).toList(),
                ),
          icon: const Icon(Icons.build_outlined),
          label: Text(
            widget.busy ? 'Submitting...' : 'Submit Maintenance Report',
          ),
        ),
      ],
    );
  }
}

class _ParkingViolationTab extends StatefulWidget {
  final List<Checkpoint> checkpoints;
  final bool busy;
  final Future<void> Function(String, String, String, String, String?) onSubmit;

  const _ParkingViolationTab({
    required this.checkpoints,
    required this.busy,
    required this.onSubmit,
  });

  @override
  State<_ParkingViolationTab> createState() => _ParkingViolationTabState();
}

class _ParkingViolationTabState extends State<_ParkingViolationTab> {
  final _plateCtrl = TextEditingController();
  final _vehicleCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  String? _checkpointId;

  @override
  void dispose() {
    _plateCtrl.dispose();
    _vehicleCtrl.dispose();
    _locationCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _SectionTitle(
          title: 'Parking Violation',
          description:
              'Log unauthorized, unsafe, or restricted-area parking issues.',
        ),
        _CheckpointField(
          checkpoints: widget.checkpoints,
          value: _checkpointId,
          onChanged: (value) => setState(() => _checkpointId = value),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _plateCtrl,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'Plate number *',
            hintText: 'ABC-1234',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _vehicleCtrl,
          decoration: const InputDecoration(
            labelText: 'Vehicle description',
            hintText: 'White Toyota Hilux',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _locationCtrl,
          decoration: const InputDecoration(
            labelText: 'Violation location',
            hintText: 'Fire lane, loading bay, reserved space...',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _notesCtrl,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Notes',
            hintText: 'Describe the issue and any action taken.',
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: widget.busy || _plateCtrl.text.trim().isEmpty
              ? null
              : () => widget.onSubmit(
                  _plateCtrl.text.trim(),
                  _vehicleCtrl.text.trim(),
                  _locationCtrl.text.trim(),
                  _notesCtrl.text.trim(),
                  _checkpointId,
                ),
          icon: const Icon(Icons.local_parking_outlined),
          label: Text(
            widget.busy ? 'Submitting...' : 'Submit Parking Violation',
          ),
        ),
      ],
    );
  }
}

class _PassOnLogTab extends StatefulWidget {
  final List<Checkpoint> checkpoints;
  final bool busy;
  final Future<void> Function(String, String, String?, String) onSubmit;

  const _PassOnLogTab({
    required this.checkpoints,
    required this.busy,
    required this.onSubmit,
  });

  @override
  State<_PassOnLogTab> createState() => _PassOnLogTabState();
}

class _PassOnLogTabState extends State<_PassOnLogTab> {
  final _titleCtrl = TextEditingController();
  final _instructionCtrl = TextEditingController();
  String? _checkpointId;
  String _priority = 'normal';

  @override
  void dispose() {
    _titleCtrl.dispose();
    _instructionCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _SectionTitle(
          title: 'Pass-On Log',
          description:
              'Create one-off instructions officers can act on without a separate acknowledgement step.',
        ),
        _CheckpointField(
          checkpoints: widget.checkpoints,
          value: _checkpointId,
          onChanged: (value) => setState(() => _checkpointId = value),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _titleCtrl,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'Instruction title *',
            hintText: 'Confirm west gate padlock before first round',
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _priority,
          decoration: const InputDecoration(labelText: 'Priority'),
          items: const ['normal', 'urgent', 'critical']
              .map(
                (value) => DropdownMenuItem(value: value, child: Text(value)),
              )
              .toList(),
          onChanged: (value) => setState(() => _priority = value ?? 'normal'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _instructionCtrl,
          onChanged: (_) => setState(() {}),
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Instruction details *',
            hintText: 'State exactly what must be completed.',
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed:
              widget.busy ||
                  _titleCtrl.text.trim().isEmpty ||
                  _instructionCtrl.text.trim().isEmpty
              ? null
              : () => widget.onSubmit(
                  _titleCtrl.text.trim(),
                  _instructionCtrl.text.trim(),
                  _checkpointId,
                  _priority,
                ),
          icon: const Icon(Icons.assignment_late_outlined),
          label: Text(widget.busy ? 'Submitting...' : 'Create Pass-On Log'),
        ),
      ],
    );
  }
}

class _CustomReportTab extends StatefulWidget {
  final List<Checkpoint> checkpoints;
  final bool busy;
  final Future<void> Function(String, String, String, String?) onSubmit;

  const _CustomReportTab({
    required this.checkpoints,
    required this.busy,
    required this.onSubmit,
  });

  @override
  State<_CustomReportTab> createState() => _CustomReportTabState();
}

class _CustomReportTabState extends State<_CustomReportTab> {
  final _titleCtrl = TextEditingController();
  final _detailsCtrl = TextEditingController();
  String _type = 'General Report';
  String? _checkpointId;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _detailsCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _SectionTitle(
          title: 'Custom Reports',
          description:
              'Capture site-specific reports that do not fit the standard categories.',
        ),
        _CheckpointField(
          checkpoints: widget.checkpoints,
          value: _checkpointId,
          onChanged: (value) => setState(() => _checkpointId = value),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _type,
          decoration: const InputDecoration(labelText: 'Report type'),
          items:
              const [
                    'General Report',
                    'Access Control',
                    'Safety Observation',
                    'Equipment Check',
                    'Supervisor Note',
                  ]
                  .map(
                    (value) =>
                        DropdownMenuItem(value: value, child: Text(value)),
                  )
                  .toList(),
          onChanged: (value) =>
              setState(() => _type = value ?? 'General Report'),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _titleCtrl,
          onChanged: (_) => setState(() {}),
          decoration: const InputDecoration(
            labelText: 'Title *',
            hintText: 'Brief report title',
          ),
        ),
        const SizedBox(height: 12),
        TextField(
          controller: _detailsCtrl,
          onChanged: (_) => setState(() {}),
          maxLines: 5,
          decoration: const InputDecoration(
            labelText: 'Details *',
            hintText: 'Document the observation, action, and follow-up.',
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed:
              widget.busy ||
                  _titleCtrl.text.trim().isEmpty ||
                  _detailsCtrl.text.trim().isEmpty
              ? null
              : () => widget.onSubmit(
                  _type,
                  _titleCtrl.text.trim(),
                  _detailsCtrl.text.trim(),
                  _checkpointId,
                ),
          icon: const Icon(Icons.note_add_outlined),
          label: Text(widget.busy ? 'Submitting...' : 'Submit Custom Report'),
        ),
      ],
    );
  }
}

class _CheckpointField extends StatelessWidget {
  final List<Checkpoint> checkpoints;
  final String? value;
  final ValueChanged<String?> onChanged;

  const _CheckpointField({
    required this.checkpoints,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String?>(
      initialValue: value,
      decoration: const InputDecoration(labelText: 'Checkpoint / site'),
      items: [
        const DropdownMenuItem<String?>(
          value: null,
          child: Text('General site report'),
        ),
        ...checkpoints.map(
          (checkpoint) => DropdownMenuItem<String?>(
            value: checkpoint.id,
            child: Text(checkpoint.name),
          ),
        ),
      ],
      onChanged: onChanged,
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;
  final String description;

  const _SectionTitle({required this.title, required this.description});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: AppTheme.text,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            description,
            style: const TextStyle(color: AppTheme.textSecondary, height: 1.4),
          ),
        ],
      ),
    );
  }
}
