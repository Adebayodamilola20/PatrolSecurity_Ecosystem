import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/theme.dart';

class VisitorCheckScreen extends StatefulWidget {
  const VisitorCheckScreen({super.key});

  @override
  State<VisitorCheckScreen> createState() => _VisitorCheckScreenState();
}

class _VisitorCheckScreenState extends State<VisitorCheckScreen> {
  final _formKey = GlobalKey<FormState>();
  final _nameCtrl = TextEditingController();
  final _phoneCtrl = TextEditingController();
  final _hostCtrl = TextEditingController();
  final _purposeCtrl = TextEditingController();
  final _plateCtrl = TextEditingController();
  final _idCtrl = TextEditingController();
  final _notesCtrl = TextEditingController();
  List<Map<String, dynamic>> _activeVisitors = [];
  bool _loading = true;
  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _phoneCtrl.dispose();
    _hostCtrl.dispose();
    _purposeCtrl.dispose();
    _plateCtrl.dispose();
    _idCtrl.dispose();
    _notesCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final data = await ApiService.getVisitors(status: 'active');
      _activeVisitors = data.cast<Map<String, dynamic>>();
    } catch (_) {}
    if (mounted) setState(() => _loading = false);
  }

  Future<void> _checkIn() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _submitting = true);
    try {
      await ApiService.visitorCheckIn(
        visitorName: _nameCtrl.text.trim(),
        visitorPhone: _phoneCtrl.text.trim(),
        hostName: _hostCtrl.text.trim(),
        purpose: _purposeCtrl.text.trim(),
        vehiclePlate: _plateCtrl.text.trim(),
        idNumber: _idCtrl.text.trim(),
        notes: _notesCtrl.text.trim(),
      );
      if (mounted) {
        _nameCtrl.clear();
        _phoneCtrl.clear();
        _hostCtrl.clear();
        _purposeCtrl.clear();
        _plateCtrl.clear();
        _idCtrl.clear();
        _notesCtrl.clear();
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Visitor checked in'), backgroundColor: AppTheme.verified),
        );
        _load();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed: ${e.toString().replaceFirst("Exception: ", "")}'),
            backgroundColor: AppTheme.flagged,
          ),
        );
      }
    }
    if (mounted) setState(() => _submitting = false);
  }

  Future<void> _checkOut(String id) async {
    try {
      await ApiService.visitorCheckOut(id);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Visitor checked out'), backgroundColor: AppTheme.verified),
        );
        _load();
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Failed: ${e.toString().replaceFirst("Exception: ", "")}'),
            backgroundColor: AppTheme.flagged,
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Visitor Check In / Out')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            elevation: 0,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16), side: BorderSide(color: AppTheme.border)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Check In Visitor', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                    const SizedBox(height: 12),
                    TextFormField(controller: _nameCtrl, decoration: const InputDecoration(labelText: 'Visitor Name *', border: OutlineInputBorder()), validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null),
                    const SizedBox(height: 10),
                    TextFormField(controller: _phoneCtrl, decoration: const InputDecoration(labelText: 'Phone', border: OutlineInputBorder())),
                    const SizedBox(height: 10),
                    TextFormField(controller: _hostCtrl, decoration: const InputDecoration(labelText: 'Host Name', border: OutlineInputBorder())),
                    const SizedBox(height: 10),
                    TextFormField(controller: _purposeCtrl, decoration: const InputDecoration(labelText: 'Purpose', border: OutlineInputBorder())),
                    const SizedBox(height: 10),
                    TextFormField(controller: _plateCtrl, decoration: const InputDecoration(labelText: 'Vehicle Plate', border: OutlineInputBorder())),
                    const SizedBox(height: 10),
                    TextFormField(controller: _idCtrl, decoration: const InputDecoration(labelText: 'ID Number', border: OutlineInputBorder())),
                    const SizedBox(height: 10),
                    TextFormField(controller: _notesCtrl, maxLines: 2, decoration: const InputDecoration(labelText: 'Notes', border: OutlineInputBorder())),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: ElevatedButton(
                        onPressed: _submitting ? null : _checkIn,
                        child: _submitting ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Check In'),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text('Active Visitors (${_activeVisitors.length})', style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
          const SizedBox(height: 8),
          if (_loading)
            const Center(child: CircularProgressIndicator())
          else if (_activeVisitors.isEmpty)
            const Card(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: Text('No active visitors', style: TextStyle(color: AppTheme.textSecondary))),
              ),
            )
          else
            ..._activeVisitors.map((v) {
              final checkedOut = v['status'] == 'completed';
              return Card(
                elevation: 0,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12), side: BorderSide(color: AppTheme.border)),
                child: ListTile(
                  title: Text(v['visitorName'] ?? '', style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text('Host: ${v['hostName'] ?? '-'} • ${v['purpose'] ?? ''}'),
                  trailing: checkedOut
                      ? const Icon(Icons.check_circle, color: AppTheme.verified)
                      : FilledButton.tonalIcon(
                          onPressed: () => _checkOut(v['id']),
                          icon: const Icon(Icons.logout, size: 16),
                          label: const Text('Check Out'),
                        ),
                ),
              );
            }),
        ],
      ),
    );
  }
}
