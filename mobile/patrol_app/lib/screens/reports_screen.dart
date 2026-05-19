import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../models/checkpoint.dart';
import '../providers/auth_provider.dart';
import '../providers/scan_provider.dart';
import '../providers/shift_provider.dart';
import '../services/api_service.dart';
import '../utils/theme.dart';

class ReportsScreen extends StatefulWidget {
  const ReportsScreen({super.key});

  @override
  State<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends State<ReportsScreen> {
  bool _submitting = false;
  String _statusMessage = '';
  DateTime _exportDate = DateTime.now();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ScanProvider>().loadCheckpoints();
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
        SnackBar(
          content: Text(message),
          backgroundColor: AppTheme.error,
        ),
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

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    final shift = context.watch<ShiftProvider>();
    final scan = context.watch<ScanProvider>();
    final checkpoints = scan.checkpoints;
    final exportLabel = DateFormat('MMM d, yyyy').format(_exportDate);

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Reports & Control'),
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: 'Daily Activity'),
              Tab(text: 'Incident'),
              Tab(text: 'Maintenance'),
              Tab(text: 'Pass-On Log'),
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
                      return _submit(
                        () => ApiService.requestDailyTourExport(
                          date: DateFormat('yyyy-MM-dd').format(_exportDate),
                        ),
                        'Excel export requested for $exportLabel.',
                      );
                    },
                    exportLabel: exportLabel,
                    onPickExportDate: _pickExportDate,
                  ),
                  _IncidentTab(
                    checkpoints: checkpoints,
                    busy: _submitting,
                    onSubmit: (title, description, checkpointId, severity) {
                      return _submit(
                        () => ApiService.reportIncident(
                          title: title,
                          description: description,
                          checkpointId: checkpointId,
                          severity: severity,
                        ),
                        'Incident report submitted.',
                      );
                    },
                  ),
                  _MaintenanceTab(
                    checkpoints: checkpoints,
                    busy: _submitting,
                    onSubmit: (title, issue, assetName, checkpointId, severity) {
                      return _submit(
                        () => ApiService.submitMaintenanceReport(
                          title: title,
                          issue: issue,
                          assetName: assetName,
                          checkpointId: checkpointId,
                          severity: severity,
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
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _buildShiftWindow(ShiftProvider shift) {
    final formatter = DateFormat('HH:mm');
    final start = shift.clockInTime == null ? '--:--' : formatter.format(shift.clockInTime!);
    final end = shift.scheduledEnd == null ? '--:--' : formatter.format(shift.scheduledEnd!);
    return '$start - $end';
  }
}

class _DailyActivityTab extends StatefulWidget {
  final List<Checkpoint> checkpoints;
  final bool busy;
  final Future<void> Function(String, String, String, String?) onSubmit;
  final Future<void> Function() onRequestExport;
  final String exportLabel;
  final Future<void> Function() onPickExportDate;

  const _DailyActivityTab({
    required this.checkpoints,
    required this.busy,
    required this.onSubmit,
    required this.onRequestExport,
    required this.exportLabel,
    required this.onPickExportDate,
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
          description: 'Summarise the shift, key patrols, and unresolved items.',
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
        const SizedBox(height: 24),
        const _SectionTitle(
          title: 'Excel Export',
          description: 'Request the day’s tour entries in spreadsheet format.',
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
          label: Text(widget.busy ? 'Requesting...' : 'Request Excel Export'),
        ),
      ],
    );
  }
}

class _IncidentTab extends StatefulWidget {
  final List<Checkpoint> checkpoints;
  final bool busy;
  final Future<void> Function(String, String, String?, String) onSubmit;

  const _IncidentTab({
    required this.checkpoints,
    required this.busy,
    required this.onSubmit,
  });

  @override
  State<_IncidentTab> createState() => _IncidentTabState();
}

class _IncidentTabState extends State<_IncidentTab> {
  final _titleCtrl = TextEditingController();
  final _descriptionCtrl = TextEditingController();
  String? _checkpointId;
  String _severity = 'low';

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descriptionCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _SectionTitle(
          title: 'Incident Report',
          description: 'Raise security, safety, or escalation issues immediately.',
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
            labelText: 'Title *',
            hintText: 'Suspicious movement near gate',
          ),
        ),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _severity,
          decoration: const InputDecoration(labelText: 'Severity'),
          items: const ['low', 'medium', 'high', 'critical']
              .map((value) => DropdownMenuItem(value: value, child: Text(value)))
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
        FilledButton.icon(
          onPressed: widget.busy || _titleCtrl.text.trim().isEmpty
              ? null
              : () => widget.onSubmit(
                    _titleCtrl.text.trim(),
                    _descriptionCtrl.text.trim(),
                    _checkpointId,
                    _severity,
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
  final Future<void> Function(String, String, String, String?, String) onSubmit;

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
  String? _checkpointId;
  String _severity = 'medium';

  @override
  void dispose() {
    _titleCtrl.dispose();
    _issueCtrl.dispose();
    _assetCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const _SectionTitle(
          title: 'Maintenance Report',
          description: 'Log failed bulbs, damaged equipment, and facility faults.',
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
              .map((value) => DropdownMenuItem(value: value, child: Text(value)))
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
        FilledButton.icon(
          onPressed: widget.busy ||
                  _titleCtrl.text.trim().isEmpty ||
                  _issueCtrl.text.trim().isEmpty
              ? null
              : () => widget.onSubmit(
                    _titleCtrl.text.trim(),
                    _issueCtrl.text.trim(),
                    _assetCtrl.text.trim(),
                    _checkpointId,
                    _severity,
                  ),
          icon: const Icon(Icons.build_outlined),
          label: Text(widget.busy ? 'Submitting...' : 'Submit Maintenance Report'),
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
          description: 'Create one-off instructions that officers must acknowledge before patrol actions.',
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
              .map((value) => DropdownMenuItem(value: value, child: Text(value)))
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
            hintText: 'State exactly what must be acknowledged and completed.',
          ),
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: widget.busy ||
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
      decoration: const InputDecoration(
        labelText: 'Checkpoint / site',
      ),
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

  const _SectionTitle({
    required this.title,
    required this.description,
  });

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
