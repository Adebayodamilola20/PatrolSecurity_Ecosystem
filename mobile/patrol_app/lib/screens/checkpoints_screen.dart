import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/scan_provider.dart';
import '../utils/routes.dart';
import '../utils/theme.dart';

class CheckpointsScreen extends StatelessWidget {
  const CheckpointsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final scan = context.watch<ScanProvider>();

    return Scaffold(
      appBar: AppBar(title: const Text('Checkpoints')),
      body: scan.checkpoints.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.location_off,
                      size: 48,
                      color: AppTheme.textSecondary.withOpacity(0.5)),
                  const SizedBox(height: 12),
                  const Text(
                    'No checkpoints loaded',
                    style: TextStyle(color: AppTheme.textSecondary),
                  ),
                ],
              ),
            )
          : RefreshIndicator(
              onRefresh: () => scan.loadCheckpoints(),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: scan.checkpoints.length,
                itemBuilder: (_, i) {
                  final cp = scan.checkpoints[i];
                  return Card(
                    margin: const EdgeInsets.only(bottom: 8),
                    child: InkWell(
                      onTap: () => Navigator.pushNamed(
                        context,
                        AppRoutes.checkpointDetail,
                        arguments: {'checkpointId': cp.id},
                      ),
                      borderRadius: BorderRadius.circular(12),
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Row(
                          children: [
                            Container(
                              width: 44,
                              height: 44,
                              decoration: BoxDecoration(
                                color: const Color(0xFF3B82F6)
                                    .withOpacity(0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(
                                Icons.location_on,
                                color: Color(0xFF3B82F6),
                                size: 22,
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    cp.name,
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w600,
                                      fontSize: 15,
                                      color: AppTheme.text,
                                    ),
                                  ),
                                  const SizedBox(height: 2),
                                  Text(
                                    '${cp.code} · ${cp.location}',
                                    style: const TextStyle(
                                      fontSize: 12,
                                      color: AppTheme.textSecondary,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                color: cp.active
                                    ? const Color(0xFF10B981).withOpacity(0.1)
                                    : AppTheme.textSecondary.withOpacity(0.1),
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Text(
                                cp.active ? 'Active' : 'Inactive',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: cp.active
                                      ? const Color(0xFF10B981)
                                      : AppTheme.textSecondary,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
