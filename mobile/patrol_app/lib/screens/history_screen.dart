import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/scan_provider.dart';
import '../utils/routes.dart';
import '../utils/theme.dart';
import '../widgets/network_error_state.dart';
import '../widgets/scan_tile.dart';

class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final scan = context.watch<ScanProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Scan History')),
      body: scan.scansLoading && scan.scans.isEmpty
          ? const Center(child: CircularProgressIndicator())
          : scan.scansError != null && scan.scans.isEmpty
          ? NetworkErrorState(
              message: scan.scansError!,
              onRetry: scan.loadScans,
            )
          : scan.scans.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    Icons.history,
                    size: 48,
                    color: AppTheme.textSecondary.withValues(alpha: 0.5),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    'No scans recorded yet',
                    style: TextStyle(color: AppTheme.textSecondary),
                  ),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: () => scan.loadScans(force: true),
              child: ListView.builder(
                padding: const EdgeInsets.symmetric(vertical: 8),
                itemCount: scan.scans.length,
                itemBuilder: (_, i) => ScanTile(
                  scan: scan.scans[i],
                  onTap: () => Navigator.pushNamed(
                    context,
                    AppRoutes.scanDetail,
                    arguments: {'scanId': scan.scans[i].id},
                  ),
                ),
              ),
            ),
    );
  }
}
