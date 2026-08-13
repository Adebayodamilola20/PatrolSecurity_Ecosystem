import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import '../models/post_order.dart';
import '../providers/duty_provider.dart';
import '../providers/shift_provider.dart';
import '../utils/theme.dart';
import '../widgets/network_error_state.dart';

class DutiesScreen extends StatefulWidget {
  const DutiesScreen({super.key});

  @override
  State<DutiesScreen> createState() => _DutiesScreenState();
}

class _DutiesScreenState extends State<DutiesScreen> {
  final _picker = ImagePicker();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<DutyProvider>().load();
    });
  }

  Future<void> _openCompleteDialog(PostOrder order) async {
    final notesCtrl = TextEditingController();
    XFile? photo;
    final duty = context.read<DutyProvider>();

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => AlertDialog(
          title: Text(order.title),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  order.instructions,
                  style: TextStyle(
                    color: AppTheme.textSecondary,
                    height: 1.4,
                  ),
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: notesCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Completion note',
                    hintText: 'What did you do at this post?',
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    final picked = await _picker.pickImage(
                      source: ImageSource.camera,
                      imageQuality: 80,
                      maxWidth: 1600,
                      maxHeight: 1600,
                    );
                    if (picked != null) setModalState(() => photo = picked);
                  },
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: Text(
                    photo == null
                        ? 'Capture proof photo'
                        : 'Retake proof photo',
                  ),
                ),
                if (photo != null) ...[
                  const SizedBox(height: 12),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Image.file(
                      File(photo!.path),
                      height: 140,
                      width: double.infinity,
                      fit: BoxFit.cover,
                    ),
                  ),
                ],
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: duty.submitting || photo == null
                  ? null
                  : () async {
                      final ok = await duty.complete(
                        orderId: order.id,
                        photo: File(photo!.path),
                        note: notesCtrl.text.trim(),
                      );
                      if (ctx.mounted && ok) Navigator.pop(ctx);
                    },
              child: Text(duty.submitting ? 'Submitting...' : 'Complete Order'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _openHandoverDialog() async {
    final summaryCtrl = TextEditingController();
    final issuesCtrl = TextEditingController();
    final equipmentCtrl = TextEditingController();
    XFile? photo;
    final duty = context.read<DutyProvider>();
    final shift = context.read<ShiftProvider>();

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setModalState) => AlertDialog(
          title: const Text('Shift Handover'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: summaryCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(
                    labelText: 'Shift summary *',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: issuesCtrl,
                  maxLines: 3,
                  decoration: const InputDecoration(labelText: 'Open issues'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: equipmentCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(
                    labelText: 'Equipment status',
                  ),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () async {
                    final picked = await _picker.pickImage(
                      source: ImageSource.camera,
                      imageQuality: 80,
                      maxWidth: 1600,
                      maxHeight: 1600,
                    );
                    if (picked != null) setModalState(() => photo = picked);
                  },
                  icon: const Icon(Icons.camera_alt_outlined),
                  label: Text(
                    photo == null
                        ? 'Add handover photo'
                        : 'Retake handover photo',
                  ),
                ),
              ],
            ),
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Cancel'),
            ),
            FilledButton(
              onPressed: duty.submitting || summaryCtrl.text.trim().isEmpty
                  ? null
                  : () async {
                      final ok = await duty.createHandover(
                        summary: summaryCtrl.text.trim(),
                        openIssues: issuesCtrl.text.trim(),
                        equipmentStatus: equipmentCtrl.text.trim(),
                        siteLabel: shift.siteLabel ?? '',
                        photo: photo != null ? File(photo!.path) : null,
                      );
                      if (ctx.mounted && ok) Navigator.pop(ctx);
                    },
              child: Text(duty.submitting ? 'Sending...' : 'Send Handover'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _acknowledgePassOnLog(DutyProvider duty, String logId) async {
    final ok = await duty.acknowledgePassOnLog(logId);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          ok
              ? 'Pass-on log acknowledged.'
              : (duty.error ?? 'Failed to acknowledge.'),
        ),
        backgroundColor: ok ? AppTheme.verified : AppTheme.error,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final duty = context.watch<DutyProvider>();

    if (duty.loading && duty.orders.isEmpty) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }

    if (duty.error != null && duty.orders.isEmpty) {
      return Scaffold(
        appBar: AppBar(title: const Text('Duties')),
        body: NetworkErrorState(
          title: 'Duties unavailable',
          message: duty.error!,
          onRetry: duty.load,
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('Duties'),
        actions: [
          TextButton.icon(
            onPressed: _openHandoverDialog,
            icon: Icon(Icons.swap_horiz, color: AppTheme.primary),
            label: Text(
              'Handover',
              style: TextStyle(color: AppTheme.primary),
            ),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: duty.load,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            if (duty.pendingHandovers.isNotEmpty) ...[
              Text(
                'Pending Handovers',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.text,
                ),
              ),
              const SizedBox(height: 12),
              ...duty.pendingHandovers.map(
                (handover) => Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          handover.siteLabel?.isNotEmpty == true
                              ? handover.siteLabel!
                              : (handover.checkpointName ?? 'Site handover'),
                          style: const TextStyle(
                            fontWeight: FontWeight.w700,
                            fontSize: 16,
                          ),
                          softWrap: true,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 6),
                        Text(
                          handover.summary,
                          style: TextStyle(color: AppTheme.textSecondary),
                          softWrap: true,
                          overflow: TextOverflow.ellipsis,
                          maxLines: 3,
                        ),
                        if ((handover.openIssues ?? '').isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Text(
                            'Issues: ${handover.openIssues}',
                            style: TextStyle(
                              fontSize: 13,
                              color: AppTheme.flagged,
                            ),
                          ),
                        ],
                        const SizedBox(height: 12),
                        Align(
                          alignment: Alignment.centerRight,
                          child: FilledButton(
                            onPressed: duty.submitting
                                ? null
                                : () => duty.acceptHandover(handover.id),
                            child: const Text('Accept Handover'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
            ],
            if (duty.pendingPassOnLogs.isNotEmpty) ...[
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(
                    'Pass-On Logs',
                    style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.text,
                    ),
                  ),
                  Container(
                    padding: EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppTheme.flagged.withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(
                      '${duty.pendingAcknowledgementCount} pending',
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.flagged,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              ...duty.pendingPassOnLogs.map((log) {
                final title = log['title'] as String? ?? 'Untitled';
                final instruction = log['instruction'] as String? ?? '';
                final priority = log['priority'] as String? ?? 'normal';
                final createdByName = log['createdByName'] as String? ?? '';
                // Where it applies, who it is from, and when. A client can
                // now write these, so "an instruction" is not enough — the
                // guard has to see whose instruction, for which gate, and
                // how old it is before acting on it at 2am.
                final createdByRole = log['createdByRole'] as String? ?? '';
                final clientName = log['clientName'] as String? ?? '';
                final placeName =
                    (log['checkpointName'] as String?)?.isNotEmpty == true
                    ? log['checkpointName'] as String
                    : (log['siteName'] as String?)?.isNotEmpty == true
                    ? log['siteName'] as String
                    : (log['siteLabel'] as String? ?? '');
                final sentAt = DateTime.tryParse(
                  log['createdAt'] as String? ?? '',
                )?.toLocal();
                final sentAtLabel = sentAt == null
                    ? ''
                    : '${sentAt.day.toString().padLeft(2, '0')}/'
                          '${sentAt.month.toString().padLeft(2, '0')} '
                          '${sentAt.hour.toString().padLeft(2, '0')}:'
                          '${sentAt.minute.toString().padLeft(2, '0')}';
                final fromLabel = [
                  if (createdByName.isNotEmpty) createdByName,
                  if (createdByRole == 'main_account' && clientName.isNotEmpty)
                    '($clientName)',
                ].join(' ');
                return Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            if (priority == 'critical')
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 4,
                                ),
                                margin: const EdgeInsets.only(right: 8),
                                decoration: BoxDecoration(
                                  color: AppTheme.flagged,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  'CRITICAL',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.white,
                                  ),
                                ),
                              )
                            else if (priority == 'urgent')
                              Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 4,
                                ),
                                margin: const EdgeInsets.only(right: 8),
                                decoration: BoxDecoration(
                                  color: Colors.orange,
                                  borderRadius: BorderRadius.circular(6),
                                ),
                                child: const Text(
                                  'URGENT',
                                  style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.white,
                                  ),
                                ),
                              ),
                            Expanded(
                              child: Text(
                                title,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                                softWrap: true,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          instruction,
                          style: TextStyle(
                            color: AppTheme.textSecondary,
                            height: 1.4,
                          ),
                          softWrap: true,
                          overflow: TextOverflow.ellipsis,
                          maxLines: 5,
                        ),
                        if (placeName.isNotEmpty) ...[
                          const SizedBox(height: 8),
                          Row(
                            children: [
                              Icon(
                                Icons.place_outlined,
                                size: 14,
                                color: AppTheme.textSecondary,
                              ),
                              const SizedBox(width: 4),
                              Expanded(
                                child: Text(
                                  placeName,
                                  style: TextStyle(
                                    fontSize: 12,
                                    color: AppTheme.textSecondary,
                                  ),
                                  softWrap: true,
                                ),
                              ),
                            ],
                          ),
                        ],
                        if (fromLabel.isNotEmpty || sentAtLabel.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            [
                              if (fromLabel.isNotEmpty) 'From $fromLabel',
                              if (sentAtLabel.isNotEmpty) sentAtLabel,
                            ].join(' · '),
                            style: TextStyle(
                              fontSize: 12,
                              color: AppTheme.textSecondary,
                            ),
                            softWrap: true,
                          ),
                        ],
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            onPressed: duty.submitting
                                ? null
                                : () => _acknowledgePassOnLog(
                                    duty,
                                    log['id'] as String,
                                  ),
                            icon: const Icon(
                              Icons.check_circle_outline,
                              size: 18,
                            ),
                            label: Text(
                              duty.submitting
                                  ? 'Acknowledging...'
                                  : 'Acknowledge & Continue',
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }),
              const SizedBox(height: 20),
            ],
            Text(
              'Post Orders',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w700,
                color: AppTheme.text,
              ),
            ),
            const SizedBox(height: 12),
            if (duty.orders.isEmpty)
              Card(
                child: Padding(
                  padding: EdgeInsets.all(20),
                  child: Text(
                    'No active post orders right now.',
                    style: TextStyle(color: AppTheme.textSecondary),
                  ),
                ),
              ),
            ...duty.orders.map((order) {
              final completion = order.latestCompletion;
              final statusText = completion == null
                  ? 'Awaiting action'
                  : completion.reviewStatus == 'verified'
                  ? 'Verified'
                  : completion.status == 'completed'
                  ? 'Submitted for review'
                  : 'Acknowledged';
              return Card(
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => _openCompleteDialog(order),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                order.title,
                                style: const TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 16,
                                ),
                                softWrap: true,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            const SizedBox(width: 6),
                            Flexible(
                              child: Container(
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 8,
                                  vertical: 6,
                                ),
                                decoration: BoxDecoration(
                                  color: completion?.reviewStatus == 'verified'
                                      ? AppTheme.verified.withValues(
                                          alpha: 0.12,
                                        )
                                      : AppTheme.flagged.withValues(
                                          alpha: 0.12,
                                        ),
                                  borderRadius: BorderRadius.circular(999),
                                ),
                                child: Text(
                                  statusText,
                                  style: TextStyle(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                    color:
                                        completion?.reviewStatus == 'verified'
                                        ? AppTheme.verified
                                        : AppTheme.flagged,
                                  ),
                                  softWrap: true,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        Text(
                          order.summary.isNotEmpty
                              ? order.summary
                              : order.instructions,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: AppTheme.textSecondary),
                        ),
                        const SizedBox(height: 10),
                        Text(
                          order.checkpointName ??
                              order.siteName ??
                              'General site order',
                          style: TextStyle(
                            fontSize: 13,
                            color: AppTheme.primary,
                            fontWeight: FontWeight.w600,
                          ),
                          softWrap: true,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            if (order.requiresAcknowledgement &&
                                completion == null)
                              Expanded(
                                flex: 1,
                                child: OutlinedButton(
                                  onPressed: duty.submitting
                                      ? null
                                      : () => duty.acknowledge(order.id),
                                  child: const Text('Acknowledge'),
                                ),
                              ),
                            if (order.requiresAcknowledgement &&
                                completion == null)
                              const SizedBox(width: 8),
                            Expanded(
                              flex: 2,
                              child: FilledButton.icon(
                                onPressed: () => _openCompleteDialog(order),
                                icon: const Icon(
                                  Icons.camera_alt_outlined,
                                  size: 18,
                                ),
                                label: const Text(
                                  'Complete',
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }
}
