import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/auth_provider.dart';
import '../utils/access_control.dart';
import '../utils/theme.dart';

class WorkflowModuleScreen extends StatelessWidget {
  final String title;
  final IconData icon;
  final List<String> capabilities;
  final List<String> visibleFor;

  const WorkflowModuleScreen({
    super.key,
    required this.title,
    required this.icon,
    required this.capabilities,
    this.visibleFor = const [],
  });

  @override
  Widget build(BuildContext context) {
    final user = context.watch<AuthProvider>().user;
    final role = roleForUser(user);

    return Scaffold(
      appBar: AppBar(title: Text(title)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(18),
            decoration: BoxDecoration(
              color: AppTheme.card,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppTheme.border),
            ),
            child: Row(
              children: [
                Container(
                  width: 52,
                  height: 52,
                  decoration: BoxDecoration(
                    color: AppTheme.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(icon, color: AppTheme.primary, size: 28),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        role.label,
                        style: TextStyle(
                          fontWeight: FontWeight.w800,
                          color: AppTheme.text,
                          fontSize: 16,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        role.scopeLabel,
                        style: TextStyle(color: AppTheme.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          ...capabilities.map(
            (item) => Card(
              child: ListTile(
                leading: Icon(
                  Icons.check_circle_outline,
                  color: AppTheme.primary,
                ),
                title: Text(item),
              ),
            ),
          ),
          if (visibleFor.isNotEmpty) ...[
            const SizedBox(height: 8),
            Card(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text(
                  'Access: ${visibleFor.join(', ')}',
                  style: TextStyle(
                    color: AppTheme.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}
